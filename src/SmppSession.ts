import EventEmitter from "events";
import {Job} from "./Job/Job";
import Logger from "./Logger";
import {PduProcessor} from "./PDUProcessor/PduProcessor";

const NanoTimer = require("nanotimer");
const smpp = require("smpp");

export abstract class SmppSession {
	readonly EVENT: any = {
		STATUS_CHANGED: "STATUS_CHANGED",
		STATE_CHANGED: "STATE_CHANGED",
		ANY_PDU: "ANY_PDU",
		MESSAGE_SEND_COUNTER_UPDATE_EVENT: "MESSAGE_SEND_COUNTER_UPDATE_EVENT",
	};
	abstract STATUS: string[];

	abstract id: number;
	abstract username: string;
	abstract password: string;
	abstract status: string;
	abstract pduProcessors: PduProcessor[];

	abstract defaultSingleJob: Job;
	abstract defaultMultipleJob: Job;

	readonly UPDATE_WS: string = "UPDATE_WS";
	readonly eventEmitter: EventEmitter = new EventEmitter();
	readonly logger: Logger = new Logger(`SmppSession`);
	readonly sendTimer: any = new NanoTimer();
	readonly counterUpdateTimer: any = new NanoTimer();
	readonly MESSAGE_SEND_UPDATE_DELAY: number = Number(process.env.MESSAGE_SEND_UPDATE_DELAY) || 500;

	constructor() {
		this.eventEmitter.on(this.EVENT.STATE_CHANGED, () => this.updateWs(this.EVENT.STATE_CHANGED));
		this.eventEmitter.on(this.EVENT.STATUS_CHANGED, () => this.updateWs(this.EVENT.STATUS_CHANGED));
		this.eventEmitter.on(this.EVENT.ANY_PDU, (pdu: any) => this.updateWs(this.EVENT.ANY_PDU, [pdu]));
		this.eventEmitter.on(this.EVENT.MESSAGE_SEND_COUNTER_UPDATE_EVENT, (count: number) => this.updateWs(this.EVENT.MESSAGE_SEND_COUNTER_UPDATE_EVENT, [count]));
	}

	abstract sendPdu(pdu: object, force?: boolean): Promise<object>;

	sendSingle(job: Job): Promise<object> {
		return this.sendPdu(job.pdu);
	}

	sendSingleDefault(): Promise<object> {
		return this.sendSingle(this.defaultSingleJob);
	}

	abstract sendMultiple(job: Job): Promise<void>;

	sendMultipleDefault(): Promise<void> {
		return this.sendMultiple(this.defaultMultipleJob);
	}

	cancelSendInterval(): void {
		this.sendTimer.clearInterval();
		this.counterUpdateTimer.clearInterval();
	}

	abstract close(): Promise<void>;

	abstract initialize(): void;

	abstract serialize(): object;

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
			case this.EVENT.STATE_CHANGED:
				message.data = JSON.stringify(this.serialize());
				break;
			case this.EVENT.STATUS_CHANGED:
				message.data = JSON.stringify(this.status);
				break;
			case this.EVENT.ANY_PDU:
				message.data = JSON.stringify(args![0]);
				break;
			case this.EVENT.MESSAGE_SEND_COUNTER_UPDATE_EVENT:
				message.data = JSON.stringify(args![0]);
				break;
		}
		this.eventEmitter.emit(this.UPDATE_WS, message);
	}

	getDefaultSingleJob(): Job {
		return this.defaultSingleJob;
	}

	setDefaultSingleJob(job: Job): void {
		this.defaultSingleJob = job;
		job.on(Job.STATE_CHANGED, this.eventJobUpdated);
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	getDefaultMultipleJob(): Job {
		return this.defaultMultipleJob;
	}

	setDefaultMultipleJob(job: Job): void {
		this.defaultMultipleJob = job;
		job.on(Job.STATE_CHANGED, this.eventJobUpdated);
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	getId(): number {
		return this.id;
	}

	setStatus(statusIndex: number): void {
		this.status = this.STATUS[statusIndex];
		this.eventEmitter.emit(this.EVENT.STATUS_CHANGED, this.status);
	}

	setUsername(username: string): void {
		this.username = username;
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	setPassword(password: string): void {
		this.password = password;
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	eventJobUpdated(): void {
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	addPduProcessor(pduProcessor: PduProcessor): void {
		this.pduProcessors.push(pduProcessor);
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	removePduProcessor(pduProcessor: PduProcessor): void {
		this.pduProcessors = this.pduProcessors.splice(this.pduProcessors.indexOf(pduProcessor), 1);
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	getPduProcessors(): PduProcessor[] {
		return this.pduProcessors;
	}

	serializePduProcessors(): object {
		this.logger.log1(`Serializing ${this.pduProcessors.length} clients`)
		return this.pduProcessors.map((processor: PduProcessor) => {
			return processor.serialize();
		});
	}

	eventAnyPdu(session: any, pdu: any): Promise<any> {
		this.eventEmitter.emit(this.EVENT.ANY_PDU, pdu);
		let successful: number = 0;
		this.pduProcessors.forEach((pduProcessor: PduProcessor) => {
			pduProcessor.processPdu(session, pdu).then((result: any) => {
				successful++;
			}, (error: any) => {
			});
		});
		if (successful === 0) {
			return Promise.reject("No PDU processor was able to process the PDU");
		} else {
			return Promise.resolve();
		}
	}
}