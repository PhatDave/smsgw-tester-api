import {Center} from "../Center/Center";
import {PDU} from "../CommonObjects";
import {PduProcessor} from "./PduProcessor";

export class DebugPduProcessor extends PduProcessor {
	serverSessionType: string = Center.name;

	processPdu(session: any, pdu: PDU, ...args: any[]): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (pdu.response) {
				session.send(pdu.response(), (replyPdu: any) => {
					resolve(replyPdu);
				});
			}
		})
	}
}