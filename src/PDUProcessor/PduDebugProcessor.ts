import {PduProcessor} from "./PduProcessor";

export class PduDebugProcessor implements PduProcessor {
	processPdu(session: any, pdu: any, ...args: any[]): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			session.send(pdu.response(), (replyPdu: any) => {
				resolve(replyPdu);
			});
		})
	}

	serialize(): object {
		return {};
	}
}