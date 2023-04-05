import {PDU} from "../CommonObjects";
import Logger from "../Logger";

export default abstract class PduProcessor {
	abstract readonly serverSessionType: string;
	readonly name: string = this.constructor.name;
	readonly logger: Logger = new Logger(`PduProcessor: ${this.name}`);

	abstract processPdu(session: any, pdu: PDU, ...args: any[]): Promise<any>;

	serialize(): object {
		return {
			servesSessionType: this.serverSessionType,
			name: this.name
		};
	}
}