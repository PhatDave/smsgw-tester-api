import Logger from "../../Logger";
import {CenterPDUProcessor} from "./CenterPDUProcessor";

const smpp = require("smpp");

export class DebugProcessor implements CenterPDUProcessor {
	private logger: Logger;

	constructor() {
		this.logger = new Logger('DebugProcessor');
	}
	processPdu(session: any, pdu: any): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			let promises = [];
			let replyPromise = session.send(pdu.response());
			let sendPromise = session.send(new smpp.PDU('enquire_link', {
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
		});
	}
}