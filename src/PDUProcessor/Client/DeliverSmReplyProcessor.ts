import {Client} from "../../Client/Client";
import {PDU} from "../../CommonObjects";
import {PduProcessor} from "../PduProcessor";

export class DeliverSmReplyProcessor extends PduProcessor {
	serverSessionType: string = Client.name;

	processPdu(session: any, pdu: PDU, ...args: any[]): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (!!pdu.command && pdu.command === 'deliver_sm') {
				// @ts-ignore
				session.send(pdu.response());
			}
		});
	}
}