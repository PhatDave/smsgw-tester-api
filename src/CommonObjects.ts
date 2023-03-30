export type PDU = {
	command?: string;
	command_status?: number;
	system_id?: string;
	password?: string;
	source_addr?: string;
	destination_addr?: string;
	short_message?: string;
	response?: (...args: any[]) => PDU;
}
export type SerializedJob = {
	pdu: PDU;
	perSecond?: number;
	count?: number;
}