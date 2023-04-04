import {Client} from "../../Client/Client";
import {PDU} from "../../CommonObjects";
import {PduProcessor} from "../PduProcessor";

export class DestinationEnumeratorProcessor extends PduProcessor {
	serverSessionType: string = Client.name;
	private iterator = 0;

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