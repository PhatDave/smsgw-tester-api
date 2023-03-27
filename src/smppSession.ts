export interface SmppSession {
    username: string,
    password: string,

    sendPdu(pdu: object): Promise<object>;

    sendSingle(Job: object): Promise<object>;

    sendMultiple(Job: object): Promise<object>;

    close(): Promise<void>;

    initialize(): void;

    serialize(): string;
}