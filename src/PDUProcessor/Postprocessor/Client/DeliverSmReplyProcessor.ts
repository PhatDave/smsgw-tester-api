import {PDU} from "../../../CommonObjects";
import Postprocessor from "../Postprocessor";

export default class DeliverSmReplyProcessor extends Postprocessor {
	constructor(type: string) {
		super(type);
	}

	processPdu(session: any, pdu: PDU, ...args: any[]): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (!!pdu.command && pdu.command === 'deliver_sm') {
				// @ts-ignore
				session.send(pdu.response());
			}
		});
	}
}