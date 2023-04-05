import EventEmitter from "events";
import Job from "./Job/Job";
import Logger from "./Logger";
import PduProcessor from "./PDUProcessor/PduProcessor";
import Postprocessor from "./PDUProcessor/Postprocessor/Postprocessor";
import Preprocessor from "./PDUProcessor/Preprocessor/Preprocessor";

const NanoTimer = require("nanotimer");
const smpp = require("smpp");

export default abstract class SmppSession {
	readonly EVENT: any = {
		STATUS_CHANGED: "STATUS_CHANGED",
		STATE_CHANGED: "STATE_CHANGED",
		ANY_PDU: "ANY_PDU",
		MESSAGE_SEND_COUNTER_UPDATE_EVENT: "MESSAGE_SEND_COUNTER_UPDATE_EVENT",
	};
	abstract STATUSES: string[];

	processors: { [key: string]: PduProcessor[] } = {};
	readonly UPDATE_WS: string = "UPDATE_WS";
	readonly eventEmitter: EventEmitter = new EventEmitter();
	readonly logger: Logger = new Logger(`SmppSession`);
	readonly sendTimer: any = new NanoTimer();
	readonly counterUpdateTimer: any = new NanoTimer();
	readonly MESSAGE_SEND_UPDATE_DELAY: number = Number(process.env.MESSAGE_SEND_UPDATE_DELAY) || 500;

	protected constructor() {
		this.eventEmitter.on(this.EVENT.STATE_CHANGED, () => this.updateWs(this.EVENT.STATE_CHANGED));
		this.eventEmitter.on(this.EVENT.STATUS_CHANGED, () => this.updateWs(this.EVENT.STATUS_CHANGED));
		this.eventEmitter.on(this.EVENT.ANY_PDU, (pdu: any) => this.updateWs(this.EVENT.ANY_PDU, [pdu]));
		this.eventEmitter.on(this.EVENT.MESSAGE_SEND_COUNTER_UPDATE_EVENT, (count: number) => this.updateWs(this.EVENT.MESSAGE_SEND_COUNTER_UPDATE_EVENT, [count]));

		this.processors[Preprocessor.name] = [];
		this.processors[Postprocessor.name] = [];
	}

	abstract _username: string;

	get username(): string {
		return this._username;
	}

	set username(username: string) {
		this._username = username;
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	abstract _password: string;

	get password(): string {
		return this._password;
	}

	set password(password: string) {
		this._password = password;
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	abstract _id: number;

	get id(): number {
		return this._id;
	}

	abstract _status: string;

	get status(): string {
		return this._status;
	}

	set status(status: string) {
		this._status = status;
		this.eventEmitter.emit(this.EVENT.STATUS_CHANGED, this.status);
	}

	abstract _defaultSingleJob: Job;

	get defaultSingleJob(): Job {
		return this._defaultSingleJob;
	}

	set defaultSingleJob(job: Job) {
		this._defaultSingleJob = job;
		job.on(Job.STATE_CHANGED, this.eventJobUpdated);
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	abstract _defaultMultipleJob: Job;

	get defaultMultipleJob(): Job {
		return this._defaultMultipleJob;
	}

	set defaultMultipleJob(job: Job) {
		this._defaultMultipleJob = job;
		job.on(Job.STATE_CHANGED, this.eventJobUpdated);
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	setStatus(statusIndex: number) {
		this._status = this.STATUSES[statusIndex];
		this.eventEmitter.emit(this.EVENT.STATUS_CHANGED, this.status);
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
		this.setStatus(this.STATUSES.length - 2);
	}

	abstract close(): Promise<void>;

	abstract serialize(): object;

	on(event: string, callback: (...args: any[]) => void): void {
		this.eventEmitter.on(event, callback);
	}

	updateWs(event: string, args?: any[]): void {
		this.logger.log1(`Update WS: ${event}`);
		let message: {
			type: string,
			data?: any
		} = {
			type: event,
		};
		switch (event) {
			case this.EVENT.STATE_CHANGED:
				message.data = this.serialize();
				break;
			case this.EVENT.STATUS_CHANGED:
				message.data = this.status;
				break;
			case this.EVENT.ANY_PDU:
				message.data = args![0];
				break;
			case this.EVENT.MESSAGE_SEND_COUNTER_UPDATE_EVENT:
				message.data = args![0];
				break;
		}
		this.eventEmitter.emit(this.UPDATE_WS, message);
	}

	eventJobUpdated(): void {
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	attachPreprocessor(processor: PduProcessor): void {
		this.attachProcessor(processor, this.processors.Preprocessor);
	}

	attachPostprocessor(processor: PduProcessor): void {
		this.attachProcessor(processor, this.processors.Postprocessor);
	}

	detachPreprocessor(processor: PduProcessor): void {
		this.detachProcessor(processor, this.processors.Preprocessor);
	}

	detachPostprocessor(processor: PduProcessor): void {
		this.detachProcessor(processor, this.processors.Postprocessor);
	}
	abstract eventAnyPdu(session: any, pdu: any): Promise<any>;

	private detachProcessor(processor: PduProcessor, array: PduProcessor[]): void {
		array.splice(array.indexOf(processor), 1);
		this.logger.log1(`Detaching PDU processor: ${processor.constructor.name}-${this.id}, now active: ${array.length} processors`);
		this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
	}

	private attachProcessor(processor: PduProcessor, array: PduProcessor[]): void {
		if (array.indexOf(processor) === -1) {
			array.push(processor);
			this.logger.log1(`Attaching PDU processor: ${processor.constructor.name}-${this.id}, now active: ${array.length} processors`);
			this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
		} else {
			this.logger.log1(`PDU processor: ${processor.constructor.name}-${this.id} already attached to session`);
		}
	}
}