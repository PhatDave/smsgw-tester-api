import Center from "../Center/Center";
import Client from "../Client/Client";
import Logger from "../Logger";
import SmppSession from "../SmppSession";
import PduProcessor from "./PduProcessor";
import BindTranscieverReplyProcessor from "./Postprocessor/Center/BindTranscieverReplyProcessor";
import DeliveryReceiptProcessor from "./Postprocessor/Center/DeliveryReceiptProcessor";
import EchoPduProcessor from "./Postprocessor/Center/EchoPduProcessor";
import EnquireLinkReplyProcessor from "./Postprocessor/Center/EnquireLinkReplyProcessor";
import SubmitSmReplyProcessor from "./Postprocessor/Center/SubmitSmReplyProcessor";
import DeliverSmReplyProcessor from "./Postprocessor/Client/DeliverSmReplyProcessor";
import Postprocessor from "./Postprocessor/Postprocessor";
import DeliveryReceiptRequestProcessor from "./Preprocessor/Client/DeliveryReceiptRequestProcessor";
import DestinationEnumeratorProcessor from "./Preprocessor/Client/DestinationEnumeratorProcessor";
import LongSmsProcessor from "./Preprocessor/Client/LongSmsProcessor";
import SourceEnumeratorProcessor from "./Preprocessor/Client/SourceEnumeratorProcessor";
import Preprocessor from "./Preprocessor/Preprocessor";

export default class ProcessorManager {
	static preprocessors: PduProcessor[];
	static postprocessors: PduProcessor[];
	private static readonly logger: Logger = new Logger(this.name);

	constructor() {
		// This is an IDIOTIC solution, but it works
		// Try running eb22a43 to find out what's wrong with the previous approach
		ProcessorManager.postprocessors = [
			new EnquireLinkReplyProcessor(Center.name),
			new DeliverSmReplyProcessor(Client.name),
			new SubmitSmReplyProcessor(Center.name),
			new BindTranscieverReplyProcessor(Center.name),
			new EchoPduProcessor(Center.name),
			new DeliveryReceiptProcessor(Center.name)
		];
		ProcessorManager.preprocessors = [
			new DestinationEnumeratorProcessor(Client.name),
			new SourceEnumeratorProcessor(Client.name),
			new DeliveryReceiptRequestProcessor(Client.name),
			new LongSmsProcessor(Client.name)
		];
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
		this.logger.log1(`Trying to attach preprocessor ${processor.name} to session ${session.constructor.name}-${session.id}`);
		if (this.areCompatible(session, processor)) {
			// This could be done a little better but this is OK for now
			switch (processor.type) {
				case Preprocessor.name:
					session.attachPreprocessor(processor);
					break;
				case Postprocessor.name:
					session.attachPostprocessor(processor);
					break;
				default:
					this.logger.log1(`Processor ${processor.name} is not a preprocessor or a postprocessor`);
					break;
			}
		}
	}

	static detachProcessor(session: SmppSession, processor: PduProcessor): void {
		this.logger.log1(`Trying to detach processor ${processor.name} from session ${session.constructor.name}-${session.id}`);
		switch (processor.type) {
			case Preprocessor.name:
				session.detachPreprocessor(processor);
				break;
			case Postprocessor.name:
				session.detachPostprocessor(processor);
				break;
			default:
				this.logger.log1(`Processor ${processor.name} is not a preprocessor or a postprocessor`);
				break;
		}
	}

	static areCompatible(session: SmppSession, processor: PduProcessor): boolean {
		this.logger.log1(`Checking compatibility between session ${session.constructor.name}-${session.id} and processor ${processor.name}`);
		return session.constructor.name === processor.sessionType;
	}

	static getProcessorsForType(type: string): PduProcessor[] {
		return this.processors.filter((processor: PduProcessor) => processor.sessionType === type);
	}

	static getPreprocessorsForType(type: string): PduProcessor[] {
		return this.preprocessors.filter((processor: PduProcessor) => processor.sessionType === type);
	}

	static getPostprocessorsForType(type: string): PduProcessor[] {
		return this.postprocessors.filter((processor: PduProcessor) => processor.sessionType === type);
	}
}