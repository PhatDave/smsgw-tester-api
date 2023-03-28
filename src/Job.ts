const smpp = require("smpp");

// TODO: Implement on change event and propagate it to sessions
export class Job {
    pdu: any;
    perSecond?: number;
    count?: number;

    constructor(pdu: any, perSecond?: number, count?: number) {
        this.pdu = pdu;
        this.perSecond = perSecond;
        this.count = count;
    }

    serialize(): string {
        return JSON.stringify(this);
    }

    static deserialize(serialized: any): Job {
        if (!serialized.pdu.command) {
            throw new Error("Invalid serialized job");
        }
        let pdu: any = new smpp.PDU(serialized.pdu.command, serialized.pdu);
        return new Job(pdu, serialized.perSecond, serialized.count);
    }

    static createEmptySingle(): Job {
        return new Job({});
    }

    static createEmptyMultiple(): Job {
        return new Job({}, 1, 1);
    }
}