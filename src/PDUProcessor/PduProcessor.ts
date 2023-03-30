import {PDU} from "../CommonObjects";
import Logger from "../Logger";
import {SmppSession} from "../SmppSession";

export abstract class PduProcessor {
	static processors: PduProcessor[] = [];
	private static logger: Logger = new Logger("PduProcessor");
	abstract readonly serverSessionType: string;
	readonly name: string = this.constructor.name;
	readonly logger: Logger = new Logger(`PduProcessor: ${this.name}`);

	static getProcessor(name: string): PduProcessor {
		this.logger.log1(`Looking for processor with name ${name}...`);
		let pduProcessor = this.processors.find((processor: PduProcessor) => processor.name === name);
		if (pduProcessor) {
			this.logger.log1(`Found processor with name ${name}`);
			return pduProcessor;
		} else {
			this.logger.log1(`Processor with name ${name} not found`);
			return this.processors[0];
		}
	}

	static attachProcessor(session: SmppSession, processor: PduProcessor): void {
		this.logger.log1(`Trying to attach processor ${processor.name} to session ${session.constructor.name}-${session.id}`);
		if (PduProcessor.areCompatible(session, processor)) {
			session.addPduProcessor(processor);
		}
	}

	static detachProcessor(session: SmppSession, processor: PduProcessor): void {
		this.logger.log1(`Trying to detach processor ${processor.name} from session ${session.constructor.name}-${session.id}`);
		session.removePduProcessor(processor);
	}

	static areCompatible(session: SmppSession, processor: PduProcessor): boolean {
		this.logger.log1(`Checking compatibility between session ${session.constructor.name}-${session.id} and processor ${processor.name}`);
		return session.constructor.name === processor.serverSessionType;
	}

	static addProcessor(processor: new () => PduProcessor): void {
		PduProcessor.processors.push(new processor());
	}

	static getProcessorsForType(type: string): PduProcessor[] {
		return this.processors.filter((processor: PduProcessor) => processor.serverSessionType === type);
	}

	abstract processPdu(session: any, pdu: PDU, ...args: any[]): Promise<any>;

	serialize(): object {
		return {
			servesSessionType: this.serverSessionType,
			name: this.name
		};
	}
}