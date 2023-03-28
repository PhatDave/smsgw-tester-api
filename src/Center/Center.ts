import EventEmitter from "events";
import {ClientEvents} from "../Client/ClientEvents";
import {Job} from "../Job/Job";
import {JobEvents} from "../Job/JobEvents";
import Logger from "../Logger";
import {SmppSession} from "../SmppSession";
import {CenterEvents} from "./CenterEvents";
import {CenterPDUProcessor} from "./CenterPDUProcessor";
import CenterStatus from "./CenterStatus";

const NanoTimer = require('nanotimer');
const smpp = require("smpp");

const MESSAGE_SEND_UPDATE_DELAY: number = Number(process.env.MESSAGE_SEND_UPDATE_DELAY) || 500;

export class Center implements SmppSession {
	port: number;
	private pendingSessions: any[] = [];
	private sessions: any[] = [];
	private nextSession: number = 0;
	private server: any;
	private eventEmitter: EventEmitter = new EventEmitter();
	private readonly logger: Logger;
	private readonly _id: number;
	private sendTimer: any | null = null;
	private counterUpdateTimer: any | null = null;

	constructor(id: number, port: number, username: string, password: string) {
		this._id = id;
		this.port = port;
		this._username = username;
		this._password = password;

		this.logger = new Logger(`Center-${id}`);

		this.initialize();
	}

	// TODO: Implement a few modes and set this to default DEBUG
	private _processor: CenterPDUProcessor | undefined;

	set processor(value: CenterPDUProcessor) {
		this._processor = value;
		this.eventEmitter.emit(CenterEvents.STATE_CHANGED, this.serialize());
	}

	private _defaultMultipleJob!: Job;

	get defaultMultipleJob(): Job {
		return this._defaultMultipleJob;
	}

	set defaultMultipleJob(value: Job) {
		this._defaultMultipleJob = value;
		this.eventEmitter.emit(CenterEvents.STATE_CHANGED, this.serialize());
	}

	private _defaultSingleJob!: Job;

	get defaultSingleJob(): Job {
		return this._defaultSingleJob;
	}

	set defaultSingleJob(value: Job) {
		this._defaultSingleJob = value;
		this.eventEmitter.emit(CenterEvents.STATE_CHANGED, this.serialize());
	}

	private _password: string;

	set password(value: string) {
		this._password = value;
		this.eventEmitter.emit(CenterEvents.STATE_CHANGED, this.serialize());
	}

	private _username: string;

	set username(value: string) {
		this._username = value;
		this.eventEmitter.emit(CenterEvents.STATE_CHANGED, this.serialize());
	}

	private _status: CenterStatus = CenterStatus.WAITING_CONNECTION;

	set status(value: CenterStatus) {
		this._status = value;
		this.eventEmitter.emit(CenterEvents.STATUS_CHANGED, this._status);
		this.eventEmitter.emit(CenterEvents.STATE_CHANGED, this.serialize());
	}

	initialize(): void {
		this._defaultSingleJob = Job.createEmptySingle();
		this._defaultMultipleJob = Job.createEmptyMultiple();
		this._defaultSingleJob.on(JobEvents.STATE_CHANGED, () => this.eventEmitter.emit(ClientEvents.STATE_CHANGED, this.serialize()));
		this._defaultMultipleJob.on(JobEvents.STATE_CHANGED, () => this.eventEmitter.emit(ClientEvents.STATE_CHANGED, this.serialize()));

		this.server = smpp.createServer({}, this.eventSessionConnected.bind(this));
		this.server.on('error', this.eventSessionError.bind(this));
		this.server.on('close', this.eventSessionClose.bind(this));
		this.server.on('pdu', this.eventAnyPdu.bind(this));
		this.server.listen(this.port);
		this.status = CenterStatus.WAITING_CONNECTION;
	}

	cancelSendInterval(): void {
		throw new Error("NEBI");
	}

	close(): Promise<void> {
		throw new Error("NEBI");
	}

	getDefaultMultipleJob(): Job {
		throw new Error("NEBI");
	}

	getDefaultSingleJob(): Job {
		throw new Error("NEBI");
	}

	getId(): number {
		throw new Error("NEBI");
	}

	sendMultiple(job: Job): Promise<void> {
		return new Promise((resolve, reject) => {
			this.validateSessions(reject);
			if (!job.count || !job.perSecond) {
				reject(`Center-${this._id} sendMultiple failed: invalid job, missing fields`);
			}
			this.logger.log1(`Center-${this._id} sending multiple messages: ${JSON.stringify(job)}`);

			let counter = 0;
			let previousUpdateCounter = 0;

			this.counterUpdateTimer = new NanoTimer();
			this.counterUpdateTimer.setInterval(() => {
				if (previousUpdateCounter !== counter) {
					this.eventEmitter.emit(ClientEvents.MESSAGE_SEND_COUNTER_UPDATE_EVENT, counter);
					previousUpdateCounter = counter;
				}
			}, '', `${MESSAGE_SEND_UPDATE_DELAY / 1000} s`);

			let count = job.count || 1;
			let interval = 1 / (job.perSecond || 1);
			this.sendTimer = new NanoTimer();
			this.sendTimer.setInterval(() => {
				if (count > 0 && counter >= count) {
					this.cancelSendInterval();
				} else {
					this.sendPdu(job.pdu, true)
						.catch(e => this.logger.log1(`Error sending message: ${e}`));
					counter++;
				}
			}, '', `${interval} s`);
			resolve();
		});
	}

	sendMultipleDefault(): Promise<void> {
		return this.sendMultiple(this.defaultMultipleJob);
	}

	sendPdu(pdu: object, force?: boolean): Promise<object> {
		return new Promise((resolve, reject) => {
			if (!force) {
				this.validateSessions(reject);
			}
			this.logger.log5(`Center-${this._id} sending PDU: ${JSON.stringify(pdu)}`);
			this.getNextSession().send(pdu, (replyPdu: object) => resolve(replyPdu));
		});
	}

	sendSingle(job: Job): Promise<object> {
		return this.sendPdu(job.pdu);
	}

	sendSingleDefault(): Promise<object> {
		return this.sendPdu(this.defaultSingleJob.pdu);
	}

	serialize(): object {
		return {
			id: this._id, port: this.port, username: this._username, password: this._password, status: this._status,
			defaultSingleJob: this._defaultSingleJob, defaultMultipleJob: this._defaultMultipleJob,
		};
	}

	setDefaultMultipleJob(job: Job): void {
		throw new Error("NEBI");
	}

	setDefaultSingleJob(job: Job): void {
		throw new Error("NEBI");
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

	private eventBindTransciever(session: any, pdu: any) {
		this.logger.log1(`Center-${this._id} got a bind_transciever with system_id ${pdu.system_id} and password ${pdu.password}`);
		session.pause();
		if (pdu.system_id === this.username && pdu.password === this.password) {
			this.logger.log1(`Center-${this._id} client connection successful`);
			session.send(pdu.response());
			session.resume();
			this.pendingSessions = this.pendingSessions.filter((s) => s !== session);
			this.sessions.push(session);
			this.updateStatus();
		} else {
			this.logger.log1(`Center-${this._id} client connection failed, invalid credentials`);
			session.send(pdu.response({
				command_status: smpp.ESME_RBINDFAIL
			}));
			this.pendingSessions = this.pendingSessions.filter((s) => s !== session);
			this.updateStatus();
			session.close();
		}
	}

	private eventSessionConnected(session: any): void {
		this.logger.log1(`A client connected to center-${this._id}`);
		this.pendingSessions.push(session);
		session.on('close', this.eventSessionClose.bind(this, session));
		session.on('error', this.eventSessionError.bind(this, session));
		session.on('bind_transciever', this.eventBindTransciever.bind(this, session));
		session.on('pdu', this.eventAnyPdu.bind(this, session));
		this.updateStatus();
		this.eventEmitter.emit(CenterEvents.STATE_CHANGED, this.serialize());
	}

	private eventSessionError(session: any): void {
		this.logger.log1(`A client encountered an error on center-${this._id}}`);
	}

	private eventSessionClose(session: any): void {
		this.logger.log1(`A client disconnected from center-${this._id}`);
		this.sessions = this.sessions.filter((s: any) => s !== session);
		this.nextSession = 0;
		this.pendingSessions = this.pendingSessions.filter((s: any) => s !== session);
		this.updateStatus();
	}

	private updateStatus(): void {
		if (this.sessions.length > 0) {
			this.status = CenterStatus.CONNECTED;
		} else if (this.pendingSessions.length > 0) {
			this.status = CenterStatus.CONNECTING;
		} else {
			this.status = CenterStatus.WAITING_CONNECTION;
		}
	}

	private eventAnyPdu(pdu: any): void {
		console.log("eventAnyPdu");
		// console.log(pdu);
		this.eventEmitter.emit(CenterEvents.ANY_PDU, pdu);
	}
}