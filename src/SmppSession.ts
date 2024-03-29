import EventEmitter from "events";
import {PDU, WSMessage} from "./CommonObjects";
import Job from "./Job/Job";
import Logger from "./Logger";
import PduProcessor from "./PDUProcessor/PduProcessor";
import Postprocessor from "./PDUProcessor/Postprocessor/Postprocessor";
import LongSmsProcessor from "./PDUProcessor/Preprocessor/Client/LongSmsProcessor";
import Preprocessor from "./PDUProcessor/Preprocessor/Preprocessor";
import ProcessorManager from "./PDUProcessor/ProcessorManager";

const NanoTimer = require("nanotimer");
const smpp = require("smpp");

export default abstract class SmppSession {
    readonly EVENT: any = {
        STATUS_CHANGED: "STATUS_CHANGED",
        STATE_CHANGED: "STATE_CHANGED",
        ANY_PDU_TX: "ANY_PDU_TX",
        ANY_PDU_RX: "ANY_PDU_RX",
        MESSAGE_SEND_COUNTER_UPDATE_EVENT: "MESSAGE_SEND_COUNTER_UPDATE_EVENT",
    };
    abstract STATUSES: string[];

    processors: { [key: string]: PduProcessor[] } = {};
    readonly UPDATE_WS: string = "UPDATE_WS";
    readonly eventEmitter: EventEmitter = new EventEmitter();
    readonly logger: Logger = new Logger(this.constructor.name);
    readonly sendTimer: any = new NanoTimer();
    readonly counterUpdateTimer: any = new NanoTimer();
    readonly MESSAGE_SEND_UPDATE_DELAY: number = Number(process.env.MESSAGE_SEND_UPDATE_DELAY) || 500;

    protected constructor() {
        this.eventEmitter.on(this.EVENT.STATE_CHANGED, () => this.updateWs(this.EVENT.STATE_CHANGED));
        this.eventEmitter.on(this.EVENT.STATUS_CHANGED, () => this.updateWs(this.EVENT.STATUS_CHANGED));
        this.eventEmitter.on(this.EVENT.ANY_PDU_TX, (pdu: any) => this.updateWs(this.EVENT.ANY_PDU_TX, [pdu]));
        this.eventEmitter.on(this.EVENT.ANY_PDU_RX, (pdu: any) => this.updateWs(this.EVENT.ANY_PDU_RX, [pdu]));
        this.eventEmitter.on(this.EVENT.MESSAGE_SEND_COUNTER_UPDATE_EVENT, (count: number) => this.updateWs(this.EVENT.MESSAGE_SEND_COUNTER_UPDATE_EVENT, [count]));

        this.processors[Preprocessor.name] = [];
        this.processors[Postprocessor.name] = [];
    }

    get appliedProcessors(): PduProcessor[] {
        return this.processors[Preprocessor.name].concat(this.processors[Postprocessor.name]);
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

    doSendPdu(pdu: PDU, session: any): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            let characterSizeBits: number = LongSmsProcessor.getCharacterSizeForEncoding(pdu);
            let maxMessageLength: number = LongSmsProcessor.maxMessageSizeBits / characterSizeBits;
            if (!!pdu.short_message && pdu.short_message.length > maxMessageLength) {
                pdu.short_message = pdu.short_message.substring(0, maxMessageLength);
            }
            session.send(pdu, (reply: any) => resolve(reply));
            this.eventEmitter.emit(this.EVENT.ANY_PDU_TX, pdu);
        });
    }

    abstract destroy(): void;

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

    serialize(): object {
        let obj = {
            id: this._id,
            username: this._username,
            password: this._password,
            status: this._status,
            defaultSingleJob: this._defaultSingleJob.serialize(),
            defaultMultipleJob: this._defaultMultipleJob.serialize(),
            preprocessors: this.processors.Preprocessor.map((p: PduProcessor) => p.serialize()),
            postprocessors: this.processors.Postprocessor.map((p: PduProcessor) => p.serialize()),
            availablePreprocessors: ProcessorManager.getPreprocessorsForType(this.constructor.name).map((p: PduProcessor) => p.serialize()),
            availablePostprocessors: ProcessorManager.getPostprocessorsForType(this.constructor.name).map((p: PduProcessor) => p.serialize()),
        };
        return this.postSerialize(obj);
    }

    abstract postSerialize(obj: object): object;

    on(event: string, callback: (...args: any[]) => void): void {
        this.eventEmitter.on(event, callback);
    }

    updateWs(event: string, args?: any[]): void {
        this.logger.log1(`Update WS: ${event}`);
        let message: WSMessage = {
            type: event,
            identifier: `${this.constructor.name}:${this.id.toString()}`
        };
        switch (event) {
            case this.EVENT.STATE_CHANGED:
                message.data = this.serialize();
                break;
            case this.EVENT.STATUS_CHANGED:
                message.data = this.status;
                break;
            case this.EVENT.ANY_PDU_RX:
            case this.EVENT.ANY_PDU_TX:
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

    eventAnyPdu(session: any, pdu: PDU): Promise<any> {
        if (!!pdu) {
            this.eventEmitter.emit(this.EVENT.ANY_PDU_RX, pdu);
            // console.log("IS PDU TIME");
            this.logger.log6(pdu);
            this.processors.Postprocessor.forEach((processor: PduProcessor) => processor.processPdu(session, pdu, this));
        }
        return Promise.resolve();
    }

    private detachProcessor(processor: PduProcessor, array: PduProcessor[]): void {
        if (array.indexOf(processor) >= 0) {
            array.splice(array.indexOf(processor), 1);
            this.logger.log1(`Detaching PDU processor: ${processor.constructor.name}-${this.id}, now active: ${array.length} processors`);
            this.eventEmitter.emit(this.EVENT.STATE_CHANGED, this.serialize());
        }
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
