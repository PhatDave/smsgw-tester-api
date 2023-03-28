import EventEmitter from "events";
import {Job} from "../Job";
import Logger from "../Logger";
import PersistentPromise from "../PersistentPromise";
import {SmppSession} from "../SmppSession";
import {ClientEvents} from "./ClientEvents";
import ClientStatus from "./ClientStatus";

const NanoTimer = require('nanotimer');
const smpp = require("smpp");

const AUTO_ENQUIRE_LINK_PERIOD: number = Number(process.env.AUTO_ENQUIRE_LINK_PERIOD) || 500;
const MESSAGE_SEND_UPDATE_DELAY: number = Number(process.env.MESSAGE_SEND_UPDATE_DELAY) || 500;

	export class Client implements SmppSession {
	defaultSingleJob: Job = Job.createEmptySingle();
	defaultMultipleJob: Job = Job.createEmptyMultiple();
	private readonly eventEmitter: EventEmitter;
	private readonly logger: Logger;
	private readonly _id: number;
	private session?: any;
	private connectPromise: PersistentPromise | null = null;
	private bindPromise: PersistentPromise | null = null;
	private sendTimer: any | null = null;
	private counterUpdateTimer: any | null = null;

	constructor(id: number, url: string, username: string, password: string) {
		this._id = id;
		this._url = url;
		this._username = username;
		this._password = password;

		this.eventEmitter = new EventEmitter();
		this.logger = new Logger(`Client-${id}`);
		this.setStatus(ClientStatus.NOT_CONNECTED)

		this.initialize();
	}

	private _username: string;

	set username(value: string) {
		this._username = value;
	}

	private _password: string;

	set password(value: string) {
		this._password = value;
	}

	private _url: string;

	getUrl(): string {
		return this._url;
	}

	set url(value: string) {
		this._url = value;
	}

	private _status: ClientStatus = ClientStatus.NOT_CONNECTED;

	set status(value: ClientStatus) {
		this._status = value;
		this.eventEmitter.emit(ClientEvents.STATUS_CHANGED, this._status);
		this.eventEmitter.emit(ClientEvents.STATE_CHANGED, this.serialize());
	}

	setDefaultSingleJob(job: Job): void {
		this.defaultSingleJob = job;
		this.eventEmitter.emit(ClientEvents.STATE_CHANGED, this.serialize());
	}

	setDefaultMultipleJob(job: Job): void {
		this.defaultMultipleJob = job;
		this.eventEmitter.emit(ClientEvents.STATE_CHANGED, this.serialize());
	}

	getDefaultSingleJob(): Job {
		return this.defaultSingleJob;
	}

	getDefaultMultipleJob(): Job {
		return this.defaultMultipleJob;
	}

	setStatus(status: ClientStatus): void {
		this._status = status;
		this.eventEmitter.emit("status", status);
	}

	initialize(): void {
		return;
	}

	connect(): PersistentPromise {
		this.connectPromise = new PersistentPromise((resolve, reject) => {
			if (this._status !== ClientStatus.NOT_CONNECTED) {
				let errorString = `Client already connected`;
				this.logger.log1(errorString);
				reject(errorString);
				return;
			}

			this.logger.log1(`Client connecting to ${this._url}`);
			this.setStatus(ClientStatus.CONNECTING);
			try {
				this.connectSession();
			} catch (e) {
				let errorString = `Client connection failed to ${this._url}`;
				this.logger.log1(errorString);

				this.setStatus(ClientStatus.NOT_CONNECTED);
				this.session.close();

				reject(errorString);
			}
		});
		return this.connectPromise;
	}

	bind(): PersistentPromise {
		this.bindPromise = new PersistentPromise((resolve, reject) => {
			if (!this.fieldsAreOk()) {
				reject();
			}

			this.session.bind_transceiver({
				system_id: this._username, password: this._password,
			}, this.eventBindReply.bind(this));
			this.setStatus(ClientStatus.BINDING);
		});
		return this.bindPromise;
	}

	connectAndBind(): Promise<void> {
		return this.connect().then(this.bind.bind(this), (error) => {
			this.logger.log1(`Client-${this._id} connectAndBind failed: ${error}`);
		});
	}

	serialize(): object {
		return {
			id: this._id, url: this._url, username: this._username, password: this._password, status: this._status,
			defaultSingleJob: this.defaultSingleJob, defaultMultipleJob: this.defaultMultipleJob,
		};
	}

	close(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.session.close();
			resolve();
		});
	}

	sendPdu(pdu: object, force?: boolean): Promise<object> {
		return new Promise((resolve, reject) => {
			if (!force) {
				this.validateSession(reject);
				this.validateBound(reject);
			}
			this.logger.log5(`Client-${this._id} sending PDU: ${JSON.stringify(pdu)}`);
			this.session.send(pdu);
			resolve(pdu);
		});
	}

	sendMultiple(job: Job): Promise<void> {
		return new Promise((resolve, reject) => {
			this.validateSession(reject);
			this.validateBound(reject);
			if (!job.count || !job.perSecond) {
				reject(`Client-${this._id} sendMultiple failed: invalid job, missing fields`);
			}
			this.logger.log1(`Client-${this._id} sending multiple messages: ${JSON.stringify(job)}`);

			this.setStatus(ClientStatus.BUSY);

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

	sendSingle(job: Job): Promise<object> {
		return this.sendPdu(job.pdu);
	}

	cancelSendInterval(): void {
		if (this.sendTimer) {
			this.sendTimer.clearInterval();
			this.counterUpdateTimer.clearInterval();
			this.sendTimer = null;
			this.counterUpdateTimer = null;
		}
		this.setStatus(ClientStatus.BOUND);
	}

	on(event: string, callback: (...args: any[]) => void): void {
		this.eventEmitter.on(event, callback);
	}

	getId(): number {
		return this._id;
	}

	sendMultipleDefault(): Promise<void> {
		return this.sendMultiple(this.getDefaultMultipleJob());
	}

	sendSingleDefault(): Promise<object> {
		return this.sendSingle(this.getDefaultSingleJob());
	}

	private connectSession(): void {
		if (!this.fieldsAreOk()) {
			return;
		}
		this.logger.log1(`Client-${this._id} connecting to ${this._url}`);

		this.session = smpp.connect({
			url: this._url, auto_enquire_link_period: AUTO_ENQUIRE_LINK_PERIOD,
		}, this.eventSessionConnected.bind(this));
		this.session.on('error', this.eventSessionError.bind(this));
		this.session.on('close', this.eventSessionClose.bind(this));
		this.session.on('pdu', this.eventAnyPdu.bind(this));
	}

	private eventSessionConnected(): void {
		this.logger.log1(`Client-${this._id} connected to ${this._url}`);
		this.setStatus(ClientStatus.CONNECTED);
		if (this.connectPromise) {
			this.connectPromise.resolve();
		}
	}

	private eventAnyPdu(pdu: any): void {
		this.logger.log6(`Client-${this._id} received PDU: ${JSON.stringify(pdu)}`);
		this.eventEmitter.emit(ClientEvents.ANY_PDU, pdu);
	}

	private eventSessionError(pdu: any): void {
		this.logger.log1(`Client-${this._id} error on ${this._url}`);
		this.setStatus(ClientStatus.NOT_CONNECTED);
		this.rejectPromises(pdu);
	}

	private eventSessionClose(): void {
		this.logger.log1(`Client-${this._id} closed on ${this._url}`);
		this.setStatus(ClientStatus.NOT_CONNECTED);
		this.rejectPromises();
	}

	private eventBindReply(pdu: any): void {
		if (pdu.command_status === 0) {
			this.logger.log1(`Client-${this._id} bound to ${this._url}`);
			this.setStatus(ClientStatus.BOUND);
			if (this.bindPromise) {
				this.bindPromise.resolve();
			}
		} else {
			this.logger.log1(`Client-${this._id} bind failed to ${this.url}`);
			this.setStatus(ClientStatus.CONNECTED);
			if (this.bindPromise) {
				this.bindPromise.reject(pdu);
			}
		}
	}

	private rejectPromises(err?: any): void {
		if (this.connectPromise) {
			this.connectPromise.reject(err);
		}
		if (this.bindPromise) {
			this.bindPromise.reject(err);
		}
	}

	private fieldsAreOk() {
		if (!this._url) {
			this.logger.log1(`Client-${this._id} has no url set`);
			return false;
		}
		if (!this._username) {
			this.logger.log1(`Client-${this._id} has no username set`);
			return false;
		}
		if (!this._password) {
			this.logger.log1(`Client-${this._id} has no password set`);
			return false;
		}
		return true;
	}

	private validateSession(reject: (reason?: any) => void) {
		if (!this.session) {
			let errorMessage = `Client-${this._id} session is not defined`;
			this.logger.log1(errorMessage);
			reject(errorMessage);
		}
	}

	private validateBound(reject: (reason?: any) => void) {
		if (this._status !== ClientStatus.BOUND) {
			let errorMessage = `Client-${this._id} is not bound`;
			this.logger.log1(errorMessage);
			reject(errorMessage);
		}
	}
}