import {PDU} from "../CommonObjects";
import Logger from "../Logger";
import SmppSession from "../SmppSession";

export default abstract class PduProcessor {
	readonly serverSessionType: string;
	readonly name: string = this.constructor.name;
	readonly logger: Logger = new Logger(`PduProcessor: ${this.name}`);

	constructor(type: string) {
		this.serverSessionType = type;
	}

	abstract processPdu(session: any, pdu: PDU, ...args: any[]): Promise<any>;

	serialize(): object {
		return {
			servesSessionType: this.serverSessionType,
			name: this.name
		};
	}
}