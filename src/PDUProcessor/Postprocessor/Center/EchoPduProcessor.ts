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
				let sentPdu = new smpp.PDU('deliver_sm', {
					source_addr: pdu.destination_addr,
					destination_addr: pdu.source_addr,
					short_message: pdu.short_message
				});
				entity?.doSendPdu(sentPdu, session);
				resolve(sentPdu);
			}
		});
	}
}