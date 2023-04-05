import Client from "../../../Client/Client";
import {PDU} from "../../../CommonObjects";
import SmppSession from "../../../SmppSession";
import Preprocessor from "../Preprocessor";

export default class DestinationEnumeratorProcessor extends Preprocessor {
	private iterator: number = 0;
	constructor(type: string) {
		super(type);
		console.log(this.serverSessionType);
	}

	processPdu(session: any, pdu: PDU, ...args: any[]): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (!!pdu.destination_addr) {
				pdu.destination_addr = pdu.destination_addr + this.padLeft(String(this.iterator++), '0', 5);
			}
		});
	}

	private padLeft(str: string, pad: string, length: number): string {
		return (new Array(length + 1).join(pad) + str).slice(-length);
	}
}