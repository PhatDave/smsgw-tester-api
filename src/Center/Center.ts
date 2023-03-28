import EventEmitter from "events";
import {ClientEvents} from "../Client/ClientEvents";
import {Job} from "../Job/Job";
import {JobEvents} from "../Job/JobEvents";
import Logger from "../Logger";
import {SmppSession} from "../SmppSession";
import {CenterEvents} from "./CenterEvents";
import CenterStatus from "./CenterStatus";

const NanoTimer = require('nanotimer');
const smpp = require("smpp");

export class Center implements SmppSession {
	defaultMultipleJob!: Job;
	defaultSingleJob!: Job;
	password: string;
	username: string;
	port: number;
	status: CenterStatus = CenterStatus.WAITING_CONNECTED;
	private sessions: any[] = [];
	private server: any;
	private eventEmitter: EventEmitter = new EventEmitter();
	private readonly logger: Logger;
	private readonly _id: number;

	constructor(id: number, port: number, username: string, password: string) {
		this._id = id;
		this.port = port;
		this.username = username;
		this.password = password;

		this.logger = new Logger(`Center-${id}`);

		this.initialize();
	}

	initialize(): void {
		this.defaultSingleJob = Job.createEmptySingle();
		this.defaultMultipleJob = Job.createEmptyMultiple();
		this.defaultSingleJob.on(JobEvents.STATE_CHANGED, () => this.eventEmitter.emit(ClientEvents.STATE_CHANGED, this.serialize()));
		this.defaultMultipleJob.on(JobEvents.STATE_CHANGED, () => this.eventEmitter.emit(ClientEvents.STATE_CHANGED, this.serialize()));

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
		throw new Error("NEBI");
	}

	sendMultipleDefault(): Promise<void> {
		throw new Error("NEBI");
	}

	sendPdu(pdu: object, force?: boolean): Promise<object> {
		throw new Error("NEBI");
	}

	sendSingle(job: Job): Promise<object> {
		throw new Error("NEBI");
	}

	sendSingleDefault(): Promise<object> {
		throw new Error("NEBI");
	}

	serialize(): object {
		return {
			id: this._id, port: this.port, username: this.username, password: this.password, status: this.status,
			defaultSingleJob: this.defaultSingleJob, defaultMultipleJob: this.defaultMultipleJob,
		};
	}

	setDefaultMultipleJob(job: Job): void {
		throw new Error("NEBI");
	}

	setDefaultSingleJob(job: Job): void {
		throw new Error("NEBI");
	}

	private eventSessionConnected(session: any): void {
		this.logger.log1(`A client connected to center-${this._id}`);
		this.sessions.push(session);
		session.on('close', this.eventSessionClose.bind(this, session));
		session.on('error', this.eventSessionError.bind(this, session));
		// session.on('pdu', this.eventAnyPdu.bind(this, session));
		this.eventEmitter.emit(CenterEvents.STATE_CHANGED, this.serialize());
	}

	private eventSessionError(error: any): void {
		this.logger.log1(`A client encountered an error on center-${this._id}`);
	}

	private eventSessionClose(session: any): void {
		this.logger.log1(`A client disconnected from center-${this._id}`);
		this.sessions = this.sessions.filter((s: any) => s !== session);
	}

	private eventAnyPdu(pdu: any): void {
		console.log("eventAnyPdu");
		console.log(pdu);
		this.eventEmitter.emit(CenterEvents.ANY_PDU, pdu);
	}
}