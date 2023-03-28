import {Job} from "./Job/Job";

// TODO: Implement on change event and propagate it to sessions
// Do something like "onJobChange" here...
// Maybe even make it default
export interface SmppSession {
	username: string,
	password: string,
	defaultSingleJob: Job;
	defaultMultipleJob: Job;
	readonly UPDATE_WS: string;

	getDefaultSingleJob(): Job;

	setDefaultSingleJob(job: Job): void;

	getDefaultMultipleJob(): Job;

	setDefaultMultipleJob(job: Job): void;

	getId(): number;

	sendPdu(pdu: object, force?: boolean): Promise<object>;

	sendSingle(job: Job): Promise<object>;

	sendSingleDefault(): Promise<object>;

	sendMultiple(job: Job): Promise<void>;

	sendMultipleDefault(): Promise<void>;

	cancelSendInterval(): void;

	close(): Promise<void>;

	initialize(): void;

	serialize(): object;

	on(event: string, callback: (...args: any[]) => void): void;

	updateWs(event: string, args?: any[]): void;
}