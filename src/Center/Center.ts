import {PDU} from "../CommonObjects";
import Job from "../Job/Job";
import Logger from "../Logger";
import PduProcessor from "../PDUProcessor/PduProcessor";
import ProcessorManager from "../PDUProcessor/ProcessorManager";
import SmppSession from "../SmppSession";

const NanoTimer = require('nanotimer');
const smpp = require("smpp");

export default class Center extends SmppSession {
	readonly STATUSES: string[] = [
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

	pduProcessors: PduProcessor[] = [];
	readonly logger: Logger;
	private pendingSessions: any[] = [];
	private sessions: any[] = [];
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
			session.send(pduCopy, (replyPdu: any) => {
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
			this.setStatus(3);
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
		this.server.listen(this.port);
		this.setStatus(0);
	}

	close(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.logger.log1(`Center-${this.id} closing active connections`);
			this.sessions.forEach((session: any) => {
				session.close();
			});
			this.setStatus(0);
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

	// TODO: Move this to smppSession and call postProcessors
	private eventBindTransceiver(session: any, pdu: PDU) {
		this.logger.log1(`Center-${this.id} got a bind_transciever with system_id ${pdu.system_id} and password ${pdu.password}`);
		session.pause();
		if (pdu.system_id === this.username && pdu.password === this.password) {
			this.logger.log1(`Center-${this.id} client connection successful`);
			if (pdu.response) {
				session.send(pdu.response());
			}
			session.resume();
			this.pendingSessions = this.pendingSessions.filter((s) => s !== session);
			this.sessions.push(session);
			this.updateStatus();
		} else {
			this.logger.log1(`Center-${this.id} client connection failed, invalid credentials (expected: ${this.username}, ${this.password})`);
			if (pdu.response) {
				session.send(pdu.response({
					command_status: smpp.ESME_RBINDFAIL
				}));
			}
			this.pendingSessions = this.pendingSessions.filter((s) => s !== session);
			this.updateStatus();
			session.close();
		}
	}

	private eventSessionConnected(session: any): void {
		this.logger.log1(`A client connected to center-${this.id}`);
		this.pendingSessions.push(session);
		session.on('close', this.eventSessionClose.bind(this, session));
		session.on('error', this.eventSessionError.bind(this, session));
		session.on('bind_transceiver', this.eventBindTransceiver.bind(this, session));
		session.on('pdu', this.eventAnyPdu.bind(this, session));
		this.updateStatus();
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	private eventSessionError(session: any): void {
		this.logger.log1(`A client encountered an error on center-${this.id}`);
	}

	private eventSessionClose(session: any): void {
		this.logger.log1(`A client disconnected from center-${this.id}`);
		this.sessions = this.sessions.filter((s: any) => s !== session);
		this.nextSession = 0;
		this.pendingSessions = this.pendingSessions.filter((s: any) => s !== session);
		this.updateStatus();
	}

	private updateStatus(): void {
		if (this.sessions.length > 0) {
			this.setStatus(2);
		} else if (this.pendingSessions.length > 0) {
			this.setStatus(1);
		} else {
			this.setStatus(0);
		}
	}

	// TODO: Move this to smppSession and call postProcessors
	eventAnyPdu(session: any, pdu: any): Promise<any> {
		this.eventEmitter.emit(this.EVENT.ANY_PDU, pdu);
		let successful: number = 0;
		this.pduProcessors.forEach((pduProcessor: PduProcessor) => {
			pduProcessor.processPdu(session, pdu).then((result: any) => {
				successful++;
			}, (error: any) => {
			});
		});
		if (successful === 0) {
			return Promise.resolve("No PDU processor was able to process the PDU");
		} else {
			return Promise.resolve();
		}
	}
}