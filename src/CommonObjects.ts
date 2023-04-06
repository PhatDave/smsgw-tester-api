export type PDU = {
	command?: string;
	command_id?: number;
	command_length?: number;
	command_status?: number;
	data_coding?: number;
	dest_addr_npi?: number;
	dest_addr_ton?: number;
	destination_addr?: string;
	esm_class?: number,
	password?: string,
	priority_flag?: number,
	protocol_id?: number,
	registered_delivery?: number,
	replace_if_present_flag?: number,
	response?: (...args: any[]) => PDU,
	schedule_delivery_time?: string,
	sequence_number?: number,
	service_type?: string,
	short_message?: any,
	sm_default_msg_id?: number,
	source_addr?: string,
	source_addr_npi?: number,
	source_addr_ton?: number,
	system_id?: string,
	validity_period?: string
};
export type SerializedJob = {
	pdu: PDU;
	count?: number;
	perSecond?: number;
};
export type WSMessage = {
	type: string;
	identifier: string;
	data?: any;
};