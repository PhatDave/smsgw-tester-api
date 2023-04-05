import SmppSession from "../../../SmppSession";
import Postprocessor from "../Postprocessor";

export default class DeliverSmReplyProcessor extends Postprocessor {
	constructor(type: string) {
		super(type);
	}

	processPdu(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
		return new Promise((resolve, reject) => {
			if (!!pdu.command && pdu.command === 'deliver_sm') {
				session.send(pdu.response());
				resolve(pdu);
			}
		});
	}
}