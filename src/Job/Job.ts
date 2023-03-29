import EventEmitter from "events";

const smpp = require("smpp");

export class Job {
	static readonly STATE_CHANGED: string = "STATE_CHANGED";
	private eventEmitter: EventEmitter = new EventEmitter();

	constructor(pdu: any, perSecond?: number, count?: number) {
		this._pdu = pdu;
		this._perSecond = perSecond;
		this._count = count;
	}

	private _pdu: any;

	get pdu(): any {
		return this._pdu;
	}

	set pdu(value: any) {
		this._pdu = value;
		this.eventEmitter.emit(Job.STATE_CHANGED, {});
	}

	private _perSecond?: number;

	get perSecond(): number {
		return <number>this._perSecond;
	}

	set perSecond(value: number) {
		this._perSecond = value;
		this.eventEmitter.emit(Job.STATE_CHANGED, {});
	}

	private _count?: number;

	get count(): number {
		return <number>this._count;
	}

	set count(value: number) {
		this._count = value;
		this.eventEmitter.emit(Job.STATE_CHANGED, {});
	}

	static deserialize(serialized: any): Job {
		if (!serialized._pdu) {
			return Job.createEmptyMultiple();
		}
		let pdu: any = new smpp.PDU(serialized._pdu.command, serialized._pdu);
		return new Job(pdu, serialized._perSecond, serialized._count);
	}

	static createEmptySingle(): Job {
		return new Job({});
	}

	static createEmptyMultiple(): Job {
		return new Job({}, 1, 1);
	}

	serialize(): string {
		return JSON.stringify(this);
	}

	on(event: string, callback: (...args: any[]) => void): void {
		this.eventEmitter.on(event, callback);
	}
}