import {PDU} from "../CommonObjects";
import Logger from "../Logger";

export default abstract class PduProcessor {
	readonly sessionType: string;
	readonly name: string = this.constructor.name;
	readonly logger: Logger = new Logger(`PduProcessor: ${this.name}`);

	constructor(type: string) {
		this.sessionType = type;
	}

	abstract processPdu(session: any, pdu: PDU, ...args: any[]): Promise<any>;

	serialize(): object {
		return {
			servesSessionType: this.sessionType,
			name: this.name
		};
	}
}