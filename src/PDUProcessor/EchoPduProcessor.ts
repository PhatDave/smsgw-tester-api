import {Center} from "../Center/Center";
import {PDU} from "../CommonObjects";
import {PduProcessor} from "./PduProcessor";

const smpp = require("smpp");

export class EchoPduProcessor extends PduProcessor {
	serverSessionType: string = Center.name;

	processPdu(session: any, pdu: PDU, ...args: any[]): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			let promises = [];
			if (pdu.response) {
				let replyPromise = session.send(pdu.response());
				let sendPromise = session.send(new smpp.PDU('deliver_sm', {
					source_addr: pdu.destination_addr,
					destination_addr: pdu.source_addr,
					short_message: pdu.short_message
				}));
				promises.push(replyPromise);
				promises.push(sendPromise);
			}
			Promise.all(promises).then((replyPdus: any) => {
				resolve(replyPdus);
			}).catch((error: any) => {
				reject(error);
			});
		});
	}
}