import EventEmitter from "events";
import {ClientEvents} from "../Client/ClientEvents";
import {Job} from "../Job/Job";
import {JobEvents} from "../Job/JobEvents";
import Logger from "../Logger";
import {SmppSession} from "../SmppSession";

export class Center implements SmppSession {
	defaultMultipleJob!: Job;
	defaultSingleJob!: Job;
	password: string;
	username: string;
	port: number;
	private eventEmitter: EventEmitter = new EventEmitter();
	private readonly logger: Logger;
	private readonly _id: number;
	private session?: any;

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
		throw new Error("NEBI");
	}

	setDefaultMultipleJob(job: Job): void {
		throw new Error("NEBI");
	}

	setDefaultSingleJob(job: Job): void {
		throw new Error("NEBI");
	}

}