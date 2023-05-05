import SmppSession from "../../../SmppSession";
import Preprocessor from "../Preprocessor";

export default class DeliveryReceiptRequestProcessor extends Preprocessor {
	applicableCommands: string[] = ['submit_sm'];

	constructor(type: string) {
		super(type);
	}

	protected doProcess(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			pdu.registered_delivery = 1;
		});
	}
}
