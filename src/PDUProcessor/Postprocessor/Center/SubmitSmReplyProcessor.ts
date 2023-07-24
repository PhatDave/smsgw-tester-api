import MessageIdManager from "../../../MessageIdManager";
import SmppSession from "../../../SmppSession";
import Postprocessor from "../Postprocessor";

export default class SubmitSmReplyProcessor extends Postprocessor {
	applicableCommands: string[] = ['submit_sm'];
	private messageIdIterator: number = 0;

	constructor(type: string) {
		super(type);
	}

	protected doProcess(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
		return new Promise((resolve, reject) => {
			let response = pdu.response();
			response.message_id = this.messageIdIterator++;
			MessageIdManager.addMessageId(pdu, response.message_id);
			entity?.doSendPdu(response, session);
			resolve(pdu);
		});
	}
}
