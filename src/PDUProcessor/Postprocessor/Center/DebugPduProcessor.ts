import {Center} from "../../../Center/Center";
import {PDU} from "../../../CommonObjects";
import Postprocessor from "../Postprocessor";

export class DebugPduProcessor extends Postprocessor {
	serverSessionType: string = Center.name;

	processPdu(session: any, pdu: PDU, ...args: any[]): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (pdu.response) {
				session.send(pdu.response(), (replyPdu: any) => {
					resolve(replyPdu);
				});
			}
		});
	}
}