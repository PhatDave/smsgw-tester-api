import MessageIdManager from "../../../MessageIdManager";
import SmppSession from "../../../SmppSession";
import Postprocessor from "../Postprocessor";

const smpp = require("smpp");

export default class DeliveryReceiptProcessor extends Postprocessor {
	constructor(type: string) {
		super(type);
	}

	processPdu(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (!!pdu.command && pdu.command === "submit_sm" && pdu.registered_delivery) {
				let drMessage: string = "";
				let date: string = new Date().toISOString().replace(/T/, '').replace(/\..+/, '').replace(/-/g, '').replace(/:/g, '').substring(2, 12);

				let relatedMessageId: number | undefined = MessageIdManager.getMessageId(pdu);
				if (relatedMessageId) {
					drMessage += "id:" + relatedMessageId + " ";
					drMessage += "sub:001 ";
					drMessage += "dlvrd:001 ";
					drMessage += "submit date:" + date + " ";
					drMessage += "done date:" + date + " ";
					drMessage += "stat:DELIVRD ";
					drMessage += "err:000 ";
					drMessage += "text:";

					let DRPdu = new smpp.PDU('deliver_sm', {
						source_addr: pdu.source_addr,
						destination_addr: pdu.destination_addr,
						short_message: drMessage,
						esm_class: 4,
					});
					entity?.doSendPdu(DRPdu, session);

					resolve(pdu);
				}
			}
		});
	}

	private padLeft(str: string, pad: string, length: number): string {
		return (new Array(length + 1).join(pad) + str).slice(-length);
	}
}