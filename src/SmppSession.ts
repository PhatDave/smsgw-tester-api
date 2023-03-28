import {Job} from "./Job";

export interface SmppSession {
	username: string,
	password: string,

	sendPdu(pdu: object): Promise<object>;

	sendSingle(job: Job): Promise<object>;

	sendMultiple(job: Job): Promise<void>;

	cancelSendInterval(): void;

	close(): Promise<void>;

	initialize(): void;

	serialize(): string;
}