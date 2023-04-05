import {PDU} from "../../../CommonObjects";
import Postprocessor from "../Postprocessor";

export default class DebugPduProcessor extends Postprocessor {
	constructor(type: string) {
		super(type);
	}

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