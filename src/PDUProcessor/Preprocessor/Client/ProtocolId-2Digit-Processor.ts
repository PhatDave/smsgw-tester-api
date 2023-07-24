import SmppSession from "../../../SmppSession";
import Preprocessor from "../Preprocessor";

export default class ProtocolId2DigitProcessor extends Preprocessor {
    applicableCommands: string[] = ['submit_sm', 'deliver_sm'];

    constructor(type: string) {
        super(type);
    }

    protected doProcess(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            pdu.protocol_id = 16;
        });
    }
}
