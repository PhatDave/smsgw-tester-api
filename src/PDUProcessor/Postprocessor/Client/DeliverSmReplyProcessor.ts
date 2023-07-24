import SmppSession from "../../../SmppSession";
import Postprocessor from "../Postprocessor";

export default class DeliverSmReplyProcessor extends Postprocessor {
    applicableCommands: string[] = ['deliver_sm'];

    constructor(type: string) {
        super(type);
    }

    protected doProcess(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
        return new Promise((resolve, reject) => {
            entity?.doSendPdu(pdu.response(), session);
            resolve(pdu);
        });
    }
}
