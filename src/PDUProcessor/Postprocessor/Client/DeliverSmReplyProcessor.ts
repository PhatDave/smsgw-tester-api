import Client from "../../../Client/Client";
import {PDU} from "../../../CommonObjects";
import Postprocessor from "../Postprocessor";

export default class DeliverSmReplyProcessor extends Postprocessor {
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