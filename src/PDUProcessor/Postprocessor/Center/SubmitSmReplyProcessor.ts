import MessageIdManager from "../../../MessageIdManager";
import SmppSession from "../../../SmppSession";
import Postprocessor from "../Postprocessor";

export default class SubmitSmReplyProcessor extends Postprocessor {
	private messageIdIterator: number = 0;

	constructor(type: string) {
		super(type);
	}

	processPdu(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
		return new Promise((resolve, reject) => {
			if (!!pdu.command && pdu.command === 'submit_sm') {
				// Add an ID here!
				let response = pdu.response();
				response.message_id = this.messageIdIterator++;
				MessageIdManager.addMessageId(pdu, response.message_id);
				entity?.doSendPdu(response, session);
				resolve(pdu);
			}
		});
	}
}