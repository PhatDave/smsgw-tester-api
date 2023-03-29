import {Center} from "../Center/Center";
import {PduProcessor} from "./PduProcessor";

export class DebugPduProcessor extends PduProcessor {
    servesSessionType: string = Center.name;

	processPdu(session: any, pdu: any, ...args: any[]): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			session.send(pdu.response(), (replyPdu: any) => {
				resolve(replyPdu);
			});
		})
	}
}