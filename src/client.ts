import {SmppSession} from "./smppSession";
import {Job} from "./job";
import Logger from "./logger";
import ClientStatus from "./clientStatus";
import EventEmitter from "events";

export class Client implements SmppSession {
    set username(value: string) {
        this._username = value;
    }

    set password(value: string) {
        this._password = value;
    }

    set url(value: string) {
        this._url = value;
    }

    set status(value: ClientStatus) {
        this._status = value;
		this.eventEmitter.emit(Client.ClientEvents.STATUS_CHANGED, this._status);
		this.eventEmitter.emit(Client.ClientEvents.STATE_CHANGED, this.serialize());
    }

	public static ClientEvents = {
		STATUS_CHANGED: "STATUS_CHANGED",
		STATE_CHANGED: "STATE_CHANGED",
	}

    private readonly eventEmitter: EventEmitter;
    private readonly logger: object;
    private readonly id: number;
    private _username: string;
    private _password: string;
    private _url: string;
    private session?: object;
    private _status: ClientStatus = ClientStatus.NOT_CONNECTED;

    defaultSingleJob?: Job;
    defaultMultipleJob?: Job;

    private promises: any = {
        connect: null,
        close: null,
        bind: null
    }

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

    setStatus(status: ClientStatus): void {
        this._status = status;
        this.eventEmitter.emit("status", status);
    }

    initialize(): void {
		return;
    }

    connect(): Promise<void> {
        this.promises.connect = new Promise((resolve, reject) => {
            if (this._status !== ClientStatus.NOT_CONNECTED) {
                this.logger.log1("Client already connected");
                reject("Client already connected");
                return;
            }
            this.logger.log1(`Client connecting to ${this._url}`);
            this.setStatus(ClientStatus.CONNECTING);
            try {
                this.session = smpp.connect({
                    url: this._url,
                    auto_enquire_link_period: this.auto_enquire_link_period,
                }, this.connected.bind(this));
                this.session.on('error', this.error.bind(this));
                this.session.on('close', this.closed.bind(this));
            } catch (e) {
                this.logger.log1("Client connection failed to " + this._url);
                this.setStatus(ClientStatus.NOT_CONNECTED);
                this.session.close();
                reject("Client connection failed to " + this._url);
            }
            this.connectingPromise.resolve = resolve;
            this.connectingPromise.reject = reject;
        });
        return this.connectingPromise.promise;
    }

    serialize(): string {
        throw new Error("Method not implemented.");
    }

    close(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    sendMultiple(Job: object): Promise<object> {
        throw new Error("Method not implemented.");
    }

    sendPdu(pdu: object): Promise<object> {
        throw new Error("Method not implemented.");
    }

    sendSingle(Job: object): Promise<object> {
        throw new Error("Method not implemented.");
    }
}