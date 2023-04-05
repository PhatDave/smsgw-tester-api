import Center from "../../../Center/Center";
import Client from "../../../Client/Client";
import {PDU} from "../../../CommonObjects";
import SmppSession from "../../../SmppSession";
import Postprocessor from "../Postprocessor";

export default class DebugPduProcessor extends Postprocessor {
	constructor(type: string) {
		super(type);
		console.log(this.serverSessionType);
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