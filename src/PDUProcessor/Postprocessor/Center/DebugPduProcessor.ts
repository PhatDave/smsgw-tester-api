import SmppSession from "../../../SmppSession";
import Postprocessor from "../Postprocessor";

export default class DebugPduProcessor extends Postprocessor {
	constructor(type: string) {
		super(type);
	}

	processPdu(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (!!pdu.command && pdu.command === "submit_sm") {
				session.send(pdu.response(), (replyPdu: any) => {
					resolve(replyPdu);
				});
			}
		});
	}
}