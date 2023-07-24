import SmppSession from "../../../SmppSession";
import Preprocessor from "../Preprocessor";
import {PDU} from "../../../CommonObjects";

export default class ProtocolId4DigitProcessor extends Preprocessor {
    applicableCommands: string[] = ['submit_sm', 'deliver_sm'];

    constructor(type: string) {
        super(type);
    }

    protected doProcess(session: any, pdu: PDU, entity?: SmppSession | undefined): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            pdu.data_coding = 2048;
        });
    }
}
