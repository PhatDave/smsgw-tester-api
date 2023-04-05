import SmppSession from "../../../SmppSession";
import Postprocessor from "../Postprocessor";

export default class EnquireLinkReplyProcessor extends Postprocessor {
	constructor(type: string) {
		super(type);
	}

	processPdu(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
		return new Promise((resolve, reject) => {
			if (!!pdu.command && pdu.command === 'enquire_link') {
				session.send(pdu.response());
				resolve(pdu);
			}
		});
	}
}