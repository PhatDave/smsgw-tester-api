export class Job {
    pdu: object;
    perSecond?: number;
    count?: number;

    serialize(): string {
        return JSON.stringify(this);
    }
}