import {Job} from "../Job/Job";
import Logger from "../Logger";
import {DebugPduProcessor} from "../PDUProcessor/DebugPduProcessor";
import {PduProcessor} from "../PDUProcessor/PduProcessor";
import {SmppSession} from "../SmppSession";

const NanoTimer = require('nanotimer');
const smpp = require("smpp");

export class Center extends SmppSession {
	readonly STATUS: string[] = [
		"WAITING CONNECTION",
		"CONNECTING",
		"CONNECTED",
	];

	id: number;
	username: string;
	password: string;
	status: string = this.STATUS[0];
	port: number;

	pduProcessors: PduProcessor[] = [];
	defaultSingleJob!: Job;
	defaultMultipleJob!: Job;
	readonly logger: Logger;
	private pendingSessions: any[] = [];
	private sessions: any[] = [];
	private nextSession: number = 0;
	private server: any;

	constructor(id: number, port: number, username: string, password: string) {
		super();
		this.id = id;
		this.username = username;
		this.password = password;
		this.port = port;

		this.defaultSingleJob = Job.createEmptySingle();
		this.defaultMultipleJob = Job.createEmptyMultiple();

		this.logger = new Logger(`Center-${id}`);

		this.initialize();
	}

	sendMultiple(job: Job): Promise<void> {
		return new Promise((resolve, reject) => {
			this.validateSessions(reject);
			if (!job.count || !job.perSecond) {
				reject(`Center-${this.getId()} sendMultiple failed: invalid job, missing fields`);
			}
			this.logger.log1(`Center-${this.getId()} sending multiple messages: ${JSON.stringify(job)}`);

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

	sendPdu(pdu: object, force?: boolean): Promise<object> {
		return new Promise((resolve, reject) => {
			if (!force) {
				this.validateSessions(reject);
			}
			this.logger.log5(`Center-${this.getId()} sending PDU: ${JSON.stringify(pdu)}`);
			this.getNextSession().send(pdu, (replyPdu: any) => {
				resolve(replyPdu);
			});
		});
	}

	initialize(): void {
		this.server = smpp.createServer({}, this.eventSessionConnected.bind(this));
		this.server.listen(this.port);
		PduProcessor.attachProcessor(this, PduProcessor.getProcessor(DebugPduProcessor.name));
		this.setStatus(0);
	}

	close(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.logger.log1(`Center-${this.getId()} closing active connections`);
			this.server.close();
			this.setStatus(0);
			resolve();
		});
	}

	serialize(): object {
		return {
			id: this.id,
			port: this.port,
			username: this.username,
			password: this.password,
			status: this.status,
			defaultSingleJob: this.defaultSingleJob.serialize(),
			defaultMultipleJob: this.defaultMultipleJob.serialize(),
			processors: this.pduProcessors.map(p => p.serialize()),
		};
	}

	getPort(): number {
		return this.port;
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

	private eventBindTransceiver(session: any, pdu: any) {
		this.logger.log1(`Center-${this.getId()} got a bind_transciever with system_id ${pdu.system_id} and password ${pdu.password}`);
		session.pause();
		if (pdu.system_id === this.username && pdu.password === this.password) {
			this.logger.log1(`Center-${this.getId()} client connection successful`);
			session.send(pdu.response());
			session.resume();
			this.pendingSessions = this.pendingSessions.filter((s) => s !== session);
			this.sessions.push(session);
			this.updateStatus();
		} else {
			this.logger.log1(`Center-${this.getId()} client connection failed, invalid credentials (expected: ${this.username}, ${this.password})`);
			session.send(pdu.response({
				command_status: smpp.ESME_RBINDFAIL
			}));
			this.pendingSessions = this.pendingSessions.filter((s) => s !== session);
			this.updateStatus();
			session.close();
		}
	}

	private eventSessionConnected(session: any): void {
		this.logger.log1(`A client connected to center-${this.getId()}`);
		this.pendingSessions.push(session);
		session.on('close', this.eventSessionClose.bind(this, session));
		session.on('error', this.eventSessionError.bind(this, session));
		session.on('bind_transceiver', this.eventBindTransceiver.bind(this, session));
		session.on('pdu', this.eventAnyPdu.bind(this, session));
		this.updateStatus();
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	private eventSessionError(session: any): void {
		this.logger.log1(`A client encountered an error on center-${this.getId()}`);
	}

	private eventSessionClose(session: any): void {
		this.logger.log1(`A client disconnected from center-${this.getId()}`);
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
}