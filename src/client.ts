import EventEmitter from "events";
import ClientStatus from "./clientStatus";
import {Job} from "./job";
import Logger from "./logger";
import PersistentPromise from "./PersistentPromise";
import {SmppSession} from "./smppSession";

const smpp = require("smpp");

const AUTO_ENQUIRE_LINK_PERIOD: number = Number(process.env.AUTO_ENQUIRE_LINK_PERIOD) || 500;

export class Client implements SmppSession {
	public static ClientEvents = {
		STATUS_CHANGED: "STATUS_CHANGED", STATE_CHANGED: "STATE_CHANGED", ANY_PDU: "ANY_PDU",
	}
	defaultSingleJob?: Job;
	defaultMultipleJob?: Job;
	private readonly eventEmitter: EventEmitter;
	private readonly logger: Logger;
	private readonly id: number;
	private session?: any;
	private connectPromise: PersistentPromise | null = null;
	private bindPromise: PersistentPromise | null = null;

	constructor(id: number, url: string, username: string, password: string) {
		this.id = id;
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

	set url(value: string) {
		this._url = value;
	}

	private _status: ClientStatus = ClientStatus.NOT_CONNECTED;

	set status(value: ClientStatus) {
		this._status = value;
		this.eventEmitter.emit(Client.ClientEvents.STATUS_CHANGED, this._status);
		this.eventEmitter.emit(Client.ClientEvents.STATE_CHANGED, this.serialize());
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
				system_id: this.username, password: this.password,
			}, this.eventBindReply.bind(this));
		});
		return this.bindPromise;
	}

	connectAndBind(): Promise<void> {
		return this.connect().then(this.bind.bind(this));
	}

	serialize(): string {
		throw new Error("Method not implemented.");
	}

	close(): Promise<void> {
		throw new Error("Method not implemented.");
	}

	sendPdu(pdu: object): Promise<object> {
		throw new Error("Method not implemented.");
	}

	sendMultiple(Job: object): Promise<object> {
		throw new Error("Method not implemented.");
	}

	sendSingle(Job: object): Promise<object> {
		throw new Error("Method not implemented.");
	}

	private connectSession(): void {
		if (!this.fieldsAreOk()) {
			return;
		}
		this.logger.log1(`Client-${this.id} connecting to ${this._url}`);

		this.session = smpp.connect({
			url: this._url, auto_enquire_link_period: AUTO_ENQUIRE_LINK_PERIOD,
		}, this.eventSessionConnected.bind(this));
		this.session.on('error', this.eventSessionError.bind(this));
		this.session.on('close', this.eventSessionClose.bind(this));
		this.session.on('pdu', this.eventAnyPdu.bind(this));
	}

	private eventSessionConnected(): void {
		this.logger.log1(`Client-${this.id} connected to ${this._url}`);
		this.setStatus(ClientStatus.CONNECTED);
		if (this.connectPromise) {
			this.connectPromise.resolve();
		}
	}

	private eventAnyPdu(pdu: any): void {
		this.logger.log6(`Client-${this.id} received PDU: ${JSON.stringify(pdu)}`);
		this.eventEmitter.emit(Client.ClientEvents.ANY_PDU, pdu);
	}

	private eventSessionError(): void {
		this.logger.log1(`Client-${this.id} error on ${this._url}`);
		this.setStatus(ClientStatus.NOT_CONNECTED);
		this.rejectPromises();
	}

	private eventSessionClose(): void {
		this.logger.log1(`Client-${this.id} closed on ${this._url}`);
		this.setStatus(ClientStatus.NOT_CONNECTED);
		this.rejectPromises();
	}

	private eventBindReply(pdu: any): void {
		if (pdu.command_status === 0) {
			this.logger.log1(`Client-${this.id} bound to ${this._url}`);
			this.setStatus(ClientStatus.BOUND);
			if (this.bindPromise) {
				this.bindPromise.resolve();
			}
		} else {
			this.logger.log1(`Client-${this.id} bind failed to ${this.url}`);
			this.setStatus(ClientStatus.CONNECTED);
			if (this.bindPromise) {
				this.bindPromise.reject();
			}
		}
	}

	private rejectPromises(): void {
		if (this.connectPromise) {
			this.connectPromise.reject();
		}
		if (this.bindPromise) {
			this.bindPromise.reject();
		}
	}

	private fieldsAreOk() {
		if (!this._url) {
			this.logger.log1(`Client-${this.id} has no url set`);
			return false;
		}
		if (!this._username) {
			this.logger.log1(`Client-${this.id} has no username set`);
			return false;
		}
		if (!this._password) {
			this.logger.log1(`Client-${this.id} has no password set`);
			return false;
		}
		return true;
	}
}