import Logger from "../Logger";
import {SmppSession} from "../SmppSession";
import {PduProcessor} from "./PduProcessor";
import {DebugPduProcessor} from "./Postprocessor/Center/DebugPduProcessor";
import {EchoPduProcessor} from "./Postprocessor/Center/EchoPduProcessor";
import {DeliverSmReplyProcessor} from "./Postprocessor/Client/DeliverSmReplyProcessor";
import {DestinationEnumeratorProcessor} from "./Preprocessor/Client/DestinationEnumeratorProcessor";
import {SourceEnumeratorProcessor} from "./Preprocessor/Client/SourceEnumeratorProcessor";

export default class ProcessorManager {
	static readonly preprocessors: PduProcessor[] = [
		new DestinationEnumeratorProcessor(),
		new SourceEnumeratorProcessor()
	];
	static readonly postprocessors: PduProcessor[] = [
		new DebugPduProcessor(),
		new EchoPduProcessor(),
		new DeliverSmReplyProcessor(),
	];
	private static readonly logger: Logger = new Logger(this.name);

	constructor() {
	}

	static get processors(): PduProcessor[] {
		return this.preprocessors.concat(this.postprocessors);
	}

	static getProcessor(name: string): PduProcessor {
		this.logger.log1(`Looking for processor with name ${name}...`);
		let pduProcessor: PduProcessor | undefined = this.processors.find((processor: PduProcessor) => processor.name === name);
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
		if (this.areCompatible(session, processor)) {
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

	static getProcessorsForType(type: string): PduProcessor[] {
		return this.processors.filter((processor: PduProcessor) => processor.serverSessionType === type);
	}
}