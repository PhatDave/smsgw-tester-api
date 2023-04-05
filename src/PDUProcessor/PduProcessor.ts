import Logger from "../Logger";
import SmppSession from "../SmppSession";

export default abstract class PduProcessor {
	readonly abstract type: string
	readonly sessionType: string;
	readonly name: string = this.constructor.name;
	readonly logger: Logger = new Logger(`PduProcessor: ${this.name}`);

	constructor(type: string) {
		this.sessionType = type;
	}

	abstract processPdu(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any>;

	serialize(): object {
		return {
			servesSessionType: this.sessionType,
			name: this.name,
			type: this.type
		};
	}
}