export interface CenterPDUProcessor {
	processPdu(session: any, pdu: any): Promise<any>;
}