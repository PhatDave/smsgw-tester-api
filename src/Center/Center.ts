import {PDU} from "../CommonObjects";
import Job from "../Job/Job";
import Logger from "../Logger";
import PduProcessor from "../PDUProcessor/PduProcessor";
import BindTranscieverReplyProcessor from "../PDUProcessor/Postprocessor/Center/BindTranscieverReplyProcessor";
import EnquireLinkReplyProcessor from "../PDUProcessor/Postprocessor/Center/EnquireLinkReplyProcessor";
import SubmitSmReplyProcessor from "../PDUProcessor/Postprocessor/Center/SubmitSmReplyProcessor";
import ProcessorManager from "../PDUProcessor/ProcessorManager";
import SmppSession from "../SmppSession";

const NanoTimer = require('nanotimer');
const smpp = require("smpp");

const PORT_RELISTEN_DELAY: number = Number(process.env.PORT_RELISTEN_DELAY) || 500;

export default class Center extends SmppSession {
	readonly STATUSES: string[] = [
		"PORT BUSY",
		"WAITING CONNECTION",
		"CONNECTING",
		"CONNECTED",
		"BUSY"
	];
	_username: string;
	_password: string;
	_id: number;
	_status: string = this.STATUSES[0];
	port: number;

	readonly logger: Logger;
	pendingSessions: any[] = [];
	sessions: any[] = [];
	private nextSession: number = 0;
	private server: any;

	constructor(id: number, port: number, username: string, password: string) {
		super();
		this._id = id;
		this._username = username;
		this._password = password;
		this.port = port;

		this._defaultSingleJob = Job.createEmptySingle('deliver_sm');
		this._defaultMultipleJob = Job.createEmptyMultiple('deliver_sm');

		ProcessorManager.attachProcessor(this, ProcessorManager.getProcessor(SubmitSmReplyProcessor.name));
		ProcessorManager.attachProcessor(this, ProcessorManager.getProcessor(BindTranscieverReplyProcessor.name));
		ProcessorManager.attachProcessor(this, ProcessorManager.getProcessor(EnquireLinkReplyProcessor.name));

		this.logger = new Logger(`Center-${id}`);

		this.initialize();
	}

	_defaultSingleJob: Job;

	get defaultSingleJob(): Job {
		return this._defaultSingleJob;
	}

	set defaultSingleJob(job: Job) {
		if (job.pdu && !job.pdu.command) {
			job.pdu.command = 'deliver_sm';
		}
		super.defaultSingleJob = job;
	}

	_defaultMultipleJob: Job;

	get defaultMultipleJob(): Job {
		return this._defaultMultipleJob;
	}

	set defaultMultipleJob(job: Job) {
		if (job.pdu && !job.pdu.command) {
			job.pdu.command = 'deliver_sm';
		}
		super.defaultMultipleJob = job;
	}

	sendPdu(pdu: PDU, force?: boolean): Promise<object> {
		return new Promise((resolve, reject) => {
			if (!force) {
				this.validateSessions(reject);
			}
			this.logger.log5(`Center-${this.id} sending PDU: ${JSON.stringify(pdu)}`);
			let pduCopy = new smpp.PDU(pdu.command, {...pdu});
			let session = this.getNextSession();
			this.processors.Preprocessor.forEach((processor: PduProcessor) => processor.processPdu(session, pduCopy));
			this.doSendPdu(pduCopy, session).then((replyPdu: any) => {
				resolve(replyPdu);
			});
		});
	}

	sendMultiple(job: Job): Promise<void> {
		return new Promise((resolve, reject) => {
			this.validateSessions(reject);
			if (!job.count || !job.perSecond) {
				reject(`Center-${this.id} sendMultiple failed: invalid job, missing fields`);
			}
			this.logger.log1(`Center-${this.id} sending multiple messages: ${JSON.stringify(job)}`);

			let counter = 0;
			let previousUpdateCounter = 0;

			this.counterUpdateTimer.setInterval(() => {
				if (previousUpdateCounter !== counter) {
					this.eventEmitter.emit(this.EVENT.MESSAGE_SEND_COUNTER_UPDATE_EVENT, counter);
					previousUpdateCounter = counter;
				}
			}, '', `${this.MESSAGE_SEND_UPDATE_DELAY / 1000} s`);

			let count = job.count || 1;
			let interval = 1 / (job.perSecond || 1);
			this.setStatus(4);
			this.sendTimer.setInterval(() => {
				if (count > 0 && counter >= count) {
					this.cancelSendInterval();
				} else {
					this.sendPdu(job.pdu, true);
					counter++;
				}
			}, '', `${interval} s`);
			resolve();
		});
	}

	initialize(): void {
		this.server = smpp.createServer({}, this.eventSessionConnected.bind(this));
		this.server.on('error', this.eventServerError.bind(this));
		this.doListen();
		this.setStatus(1);
	}

	close(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.logger.log1(`Center-${this.id} closing active connections`);
			this.server.close();
			this.sessions.forEach((session: any) => {
				session.close();
			});
			this.setStatus(1);
			resolve();
		});
	}

	serialize(): object {
		return {
			id: this._id,
			port: this.port,
			username: this._username,
			password: this._password,
			status: this._status,
			defaultSingleJob: this._defaultSingleJob.serialize(),
			defaultMultipleJob: this._defaultMultipleJob.serialize(),
			preprocessors: this.processors.Preprocessor.map((p: PduProcessor) => p.serialize()),
			postprocessors: this.processors.Postprocessor.map((p: PduProcessor) => p.serialize()),
			availablePreprocessors: ProcessorManager.getPreprocessorsForType(this.constructor.name).map((p: PduProcessor) => p.serialize()),
			availablePostprocessors: ProcessorManager.getPostprocessorsForType(this.constructor.name).map((p: PduProcessor) => p.serialize()),
		};
	}

	updateStatus(): void {
		if (this.sessions.length > 0) {
			this.setStatus(3);
		} else if (this.pendingSessions.length > 0) {
			this.setStatus(2);
		} else {
			this.setStatus(1);
		}
	}

	private doListen(): void {
		this.server.listen(this.port);
	}

	private validateSessions(reject: (reason?: any) => void) {
		if (this.sessions.length === 0) {
			reject(`No clients connected`);
		}
	}

	private getNextSession(): any {
		if (this.sessions.length === 0) {
			return null;
		}
		let session = this.sessions[this.nextSession];
		this.nextSession = (this.nextSession + 1) % this.sessions.length;
		return session;
	}

	private eventSessionConnected(session: any): void {
		this.logger.log1(`A client connected to center-${this.id}`);
		this.pendingSessions.push(session);
		session.on('close', this.eventSessionClose.bind(this, session));
		session.on('error', this.eventSessionError.bind(this, session));
		session.on('pdu', this.eventAnyPdu.bind(this, session));
		this.updateStatus();
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	private eventSessionError(session: any): void {
		this.logger.log1(`A client encountered an error on center-${this.id}`);
	}

	private eventServerError(): void {
		this.logger.log1(`Center tried listening on port which is already in use, retrying in ${PORT_RELISTEN_DELAY}`);
		this.setStatus(0);
		setTimeout(this.doListen.bind(this), PORT_RELISTEN_DELAY);
	}

	private eventSessionClose(session: any): void {
		this.logger.log1(`A client disconnected from center-${this.id}`);
		this.sessions = this.sessions.filter((s: any) => s !== session);
		this.nextSession = 0;
		this.pendingSessions = this.pendingSessions.filter((s: any) => s !== session);
		this.updateStatus();
	}
}