import SmppSession from "../../../SmppSession";
import Postprocessor from "../Postprocessor";

const smpp = require("smpp");

export default class EchoPduProcessor extends Postprocessor {
	constructor(type: string) {
		super(type);
	}

	processPdu(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (!!pdu.command && pdu.command === "submit_sm") {
				let promises = [];
				let replyPromise = session.send(pdu.response());
				let sendPromise = session.send(new smpp.PDU('deliver_sm', {
					source_addr: pdu.destination_addr,
					destination_addr: pdu.source_addr,
					short_message: pdu.short_message
				}));
				promises.push(replyPromise);
				promises.push(sendPromise);
				Promise.all(promises).then((replyPdus: any) => {
					resolve(replyPdus);
				}).catch((error: any) => {
					reject(error);
				});
			}
		});
	}
}