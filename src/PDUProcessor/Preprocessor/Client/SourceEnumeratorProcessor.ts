import SmppSession from "../../../SmppSession";
import Preprocessor from "../Preprocessor";

export default class SourceEnumeratorProcessor extends Preprocessor {
	private iterator: number = 0;

	constructor(type: string) {
		super(type);
	}

	processPdu(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (!!pdu.source_addr) {
				pdu.source_addr = pdu.source_addr + this.padLeft(String(this.iterator++), '0', 5);
			}
		});
	}

	private padLeft(str: string, pad: string, length: number): string {
		return (new Array(length + 1).join(pad) + str).slice(-length);
	}
}