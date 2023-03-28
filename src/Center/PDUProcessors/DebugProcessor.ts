import Logger from "../../Logger";
import {CenterPDUProcessor} from "./CenterPDUProcessor";

export class DebugProcessor implements CenterPDUProcessor {
	private logger: Logger;

	constructor() {
		this.logger = new Logger('DebugProcessor');
	}

	processPdu(session: any, pdu: any): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			session.send(pdu.response()).then((replyPdu: any) => resolve(replyPdu), (error: any) => reject(error));
		});
	}
}