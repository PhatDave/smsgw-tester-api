export interface PduProcessor {
	processPdu(session: any, pdu: any, ...args: any[]): Promise<any>;

	serialize(): object;
}