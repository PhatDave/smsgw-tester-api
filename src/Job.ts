const smpp = require("smpp");

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

    static createEmptySingle(): Job {
        return new Job({});
    }

    static createEmptyMultiple(): Job {
        return new Job({}, 1, 1);
    }
}