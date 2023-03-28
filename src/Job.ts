export class Job {
    pdu: object;
    perSecond?: number;
    count?: number;

    constructor(pdu: object, perSecond?: number, count?: number) {
        this.pdu = pdu;
        this.perSecond = perSecond;
        this.count = count;
    }

    serialize(): string {
        return JSON.stringify(this);
    }
}