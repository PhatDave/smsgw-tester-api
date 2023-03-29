import EventEmitter from "events";
import {Job} from "../Job/Job";
import {JobEvents} from "../Job/JobEvents";
import Logger from "../Logger";
import {SmppSession} from "../SmppSession";
import CenterStatus from "./CenterStatus";
import {CenterPDUProcessor} from "./PDUProcessors/CenterPDUProcessor";
import {DebugProcessor} from "./PDUProcessors/DebugProcessor";

const NanoTimer = require('nanotimer');
const smpp = require("smpp");

const MESSAGE_SEND_UPDATE_DELAY: number = Number(process.env.MESSAGE_SEND_UPDATE_DELAY) || 500;

export class Center implements SmppSession {
	static EVENTS: any = {
		STATUS_CHANGED: "STATUS_CHANGED",
		STATE_CHANGED: "STATE_CHANGED",
		ANY_PDU: "ANY_PDU",
		MESSAGE_SEND_COUNTER_UPDATE_EVENT: "MESSAGE_SEND_COUNTER_UPDATE_EVENT",
	}
	UPDATE_WS: string = "UPDATE_WS";
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
		this._port = port;
		this._username = username;
		this._password = password;

		this.logger = new Logger(`Center-${id}`);

		this.eventEmitter.on(Center.EVENTS.STATE_CHANGED, () => this.updateWs(Center.EVENTS.STATE_CHANGED));
		this.eventEmitter.on(Center.EVENTS.STATUS_CHANGED, () => this.updateWs(Center.EVENTS.STATUS_CHANGED));
		this.eventEmitter.on(Center.EVENTS.ANY_PDU, (pdu: any) => this.updateWs(Center.EVENTS.ANY_PDU, [pdu]));
		this.eventEmitter.on(Center.EVENTS.MESSAGE_SEND_COUNTER_UPDATE_EVENT, (count: number) => this.updateWs(Center.EVENTS.MESSAGE_SEND_COUNTER_UPDATE_EVENT, [count]));

		this.initialize();
	}

	get id(): number {
		return this._id;
	}

	private _port: number;

	get port(): number {
		return this._port;
	}

	// TODO: Implement processor switching
	private _processor: CenterPDUProcessor = new DebugProcessor();

	get processor(): CenterPDUProcessor {
		return this._processor;
	}

	set processor(value: CenterPDUProcessor) {
		this._processor = value;
		this.eventEmitter.emit(Center.EVENTS.STATE_CHANGED, this.serialize());
	}

	private _defaultMultipleJob!: Job;

	get defaultMultipleJob(): Job {
		return this._defaultMultipleJob;
	}

	set defaultMultipleJob(value: Job) {
		this._defaultMultipleJob = value;
		this.eventEmitter.emit(Center.EVENTS.STATE_CHANGED, this.serialize());
	}

	private _defaultSingleJob!: Job;

	get defaultSingleJob(): Job {
		return this._defaultSingleJob;
	}

	set defaultSingleJob(value: Job) {
		this._defaultSingleJob = value;
		this.eventEmitter.emit(Center.EVENTS.STATE_CHANGED, this.serialize());
	}

	private _password: string;

	get password(): string {
		return this._password;
	}

	set password(value: string) {
		this._password = value;
		this.eventEmitter.emit(Center.EVENTS.STATE_CHANGED, this.serialize());
	}

	private _username: string;

	get username(): string {
		return this._username;
	}

	set username(value: string) {
		this._username = value;
		this.eventEmitter.emit(Center.EVENTS.STATE_CHANGED, this.serialize());
	}

	private _status: CenterStatus = CenterStatus.WAITING_CONNECTION;

	get status(): CenterStatus {
		return this._status;
	}

	set status(value: CenterStatus) {
		this._status = value;
		this.eventEmitter.emit(Center.EVENTS.STATUS_CHANGED, this._status);
		this.eventEmitter.emit(Center.EVENTS.STATE_CHANGED, this.serialize());
	}

	on(event: string, callback: (...args: any[]) => void): void {
		this.eventEmitter.on(event, callback);
	}

	updateWs(event: string, args?: any[]): void {
		this.logger.log1(`Update WS: ${event}`);
		let message: {
			type: string,
			data?: string
		} = {
			type: event,
		};
		switch (event) {
			case Center.EVENTS.STATE_CHANGED:
				message.data = JSON.stringify(this.serialize());
				break;
			case Center.EVENTS.STATUS_CHANGED:
				message.data = JSON.stringify(this._status);
				break;
			case Center.EVENTS.ANY_PDU:
				message.data = JSON.stringify(args![0]);
				break;
			case Center.EVENTS.MESSAGE_SEND_COUNTER_UPDATE_EVENT:
				message.data = JSON.stringify(args![0]);
				break;
		}
		this.eventEmitter.emit(this.UPDATE_WS, message);
	}

	initialize(): void {
		this._defaultSingleJob = Job.createEmptySingle();
		this._defaultMultipleJob = Job.createEmptyMultiple();
		this._defaultSingleJob.on(JobEvents.STATE_CHANGED, () => this.eventEmitter.emit(Center.EVENTS.STATE_CHANGED, this.serialize()));
		this._defaultMultipleJob.on(JobEvents.STATE_CHANGED, () => this.eventEmitter.emit(Center.EVENTS.STATE_CHANGED, this.serialize()));

		this.server = smpp.createServer({}, this.eventSessionConnected.bind(this));
		this.server.listen(this._port);
		this.status = CenterStatus.WAITING_CONNECTION;
	}

	cancelSendInterval(): void {
		if (this.sendTimer) {
			this.sendTimer.clearInterval();
			this.counterUpdateTimer.clearInterval();
			this.sendTimer = null;
			this.counterUpdateTimer = null;
		}
	}

	close(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.logger.log1(`Center-${this._id} closing...`);
			this.server.close();
			this.status = CenterStatus.WAITING_CONNECTION;
			resolve();
		});
	}

	getDefaultMultipleJob(): Job {
		return this.getDefaultSingleJob();
	}

	getDefaultSingleJob(): Job {
		return this.defaultSingleJob;
	}

	getId(): number {
		return this.id;
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
					this.eventEmitter.emit(Center.EVENTS.MESSAGE_SEND_COUNTER_UPDATE_EVENT, counter);
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
					this.sendPdu(job.pdu, true);
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
			this.getNextSession().send(pdu, (replyPdu: any) => {
				resolve(replyPdu);
			});
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
			id: this._id,
			port: this._port,
			username: this._username,
			password: this._password,
			status: this._status,
			defaultSingleJob: this._defaultSingleJob,
			defaultMultipleJob: this._defaultMultipleJob,
		};
	}

	setDefaultMultipleJob(job: Job): void {
		this.defaultMultipleJob = job;
	}

	setDefaultSingleJob(job: Job): void {
		this.defaultSingleJob = job;
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
			this.logger.log1(`Center-${this._id} client connection failed, invalid credentials (expected: ${this.username}, ${this.password})`);
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
		session.on('bind_transceiver', this.eventBindTransceiver.bind(this, session));
		session.on('pdu', this.eventAnyPdu.bind(this, session));
		this.updateStatus();
		this.eventEmitter.emit(Center.EVENTS.STATE_CHANGED, this.serialize());
	}

	private eventSessionError(session: any): void {
		this.logger.log1(`A client encountered an error on center-${this._id}`);
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

	private eventAnyPdu(session: any, pdu: any): void {
		this.eventEmitter.emit(Center.EVENTS.ANY_PDU, pdu);
		this.processor.processPdu(session, pdu).then(() => {
		}, () => {
		});
	}
}