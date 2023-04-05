import Client from "../../../Client/Client";
import {PDU} from "../../../CommonObjects";
import Preprocessor from "../Preprocessor";

export default class SourceEnumeratorProcessor extends Preprocessor {
	serverSessionType: string = Client.name;
	private iterator = 0;

	processPdu(session: any, pdu: PDU, ...args: any[]): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (!!pdu.source_addr) {
				pdu.source_addr = pdu.source_addr + this.padLeft(String(this.iterator++), '0', 5);
			}
		});
	}

	private padLeft(str: string, pad: string, length: number): string {
		return (new Array(length + 1).join(pad) + str).slice(-length);
	}
}