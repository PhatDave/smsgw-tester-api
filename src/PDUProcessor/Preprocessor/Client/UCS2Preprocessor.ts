import {PDU} from "../../../CommonObjects";
import SmppSession from "../../../SmppSession";
import Preprocessor from "../Preprocessor";

export default class UCS2Preprocessor extends Preprocessor {
    applicableCommands: string[] = ['submit_sm', 'deliver_sm'];

    constructor(type: string) {
        super(type);
    }

    protected doProcess(session: any, pdu: PDU, entity?: SmppSession | undefined): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            pdu.data_coding = 8;
        });
    }
}
