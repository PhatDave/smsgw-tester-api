import Logger from "../Logger";
import SmppSession from "../SmppSession";

export default abstract class PduProcessor {
	readonly abstract type: string
	readonly sessionType: string;
	readonly name: string = this.constructor.name;
	readonly logger: Logger = new Logger(`PduProcessor: ${this.name}`);
	abstract applicableCommands: string[];

	constructor(type: string) {
		this.sessionType = type;
	}

	protected pduDoesApply(pdu: any): boolean {
		if (pdu.command) {
			return this.applicableCommands.includes(pdu.command);
		}
		return false;
	}

	protected abstract doProcess(session: any, pdu: any, entity?: SmppSession | undefined): any;

	processPdu(session: any, pdu: any, entity?: SmppSession | undefined): any {
		if (this.pduDoesApply(pdu)) {
			return this.doProcess(session, pdu, entity);
		}
	}

	serialize(): object {
		return {
			servesSessionType: this.sessionType,
			name: this.name,
			type: this.type
		};
	}
}
