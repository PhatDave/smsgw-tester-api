import SmppSession from "../../../SmppSession";
import Preprocessor from "../Preprocessor";

export default class DeliveryReceiptRequestProcessor extends Preprocessor {
	private iterator: number = 0;

	constructor(type: string) {
		super(type);
	}

	processPdu(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (!!pdu.command && pdu.command === "submit_sm") {
				pdu.registered_delivery = 1;
			}
		});
	}
}