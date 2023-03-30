import EventEmitter from "events";
import {PDU, SerializedJob} from "../CommonObjects";

const smpp = require("smpp");

export class Job {
	static readonly STATE_CHANGED: string = "STATE_CHANGED";
	private eventEmitter: EventEmitter = new EventEmitter();

	constructor(pdu: PDU, perSecond?: number, count?: number) {
		this._pdu = pdu;
		this._perSecond = perSecond;
		this._count = count;
	}

	private _pdu: PDU;

	get pdu(): PDU {
		return this._pdu;
	}

	set pdu(value: PDU) {
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

	static deserialize(serialized: SerializedJob): Job {
		if (!serialized.pdu || !serialized.pdu.command) {
			if (!serialized.perSecond && !serialized.count) {
				return Job.createEmptySingle();
			} else {
				return Job.createEmptyMultiple();
			}
		}
		let pdu: PDU = new smpp.PDU(serialized.pdu.command, serialized.pdu);
		return new Job(pdu, serialized.perSecond, serialized.count);
	}

	static createEmptySingle(): Job {
		return new Job({});
	}

	static createEmptyMultiple(): Job {
		return new Job({}, 1, 1);
	}

	update(req: any): void {
		if (req.body.source != this._pdu.source_addr) {
			this._pdu.source_addr = req.body.source;
		}
		if (req.body.destination != this._pdu.destination_addr) {
			this._pdu.destination_addr = req.body.destination;
		}
		if (req.body.message != this._pdu.short_message) {
			this._pdu.short_message = req.body.message;
		}
		if (!!this._perSecond && !!req.body.perSecond && req.body.perSecond != this._perSecond) {
			this._perSecond = req.body.perSecond;
		}
		if (!!this._count && !!req.body.count && req.body.count != this._count) {
			this._count = req.body.count;
		}
	}

	serialize(): SerializedJob {
		return {
			pdu: this.pdu,
			perSecond: this.perSecond,
			count: this.count
		};
	}

	on(event: string, callback: (...args: any[]) => void): void {
		this.eventEmitter.on(event, callback);
	}
}