import SmppSession from "../../../SmppSession";
import Postprocessor from "../Postprocessor";

const smpp = require("smpp");

export default class EchoPduProcessor extends Postprocessor {
    applicableCommands: string[] = ['submit_sm'];

    constructor(type: string) {
        super(type);
    }

    protected doProcess(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            // Temporary (?) safeguard against echoing long sms
            if (!pdu.short_message.udh) {
                let echoPdu = new smpp.PDU('deliver_sm', {...pdu});
                echoPdu.source_addr = pdu.destination_addr;
                echoPdu.destination_addr = pdu.source_addr;
                entity?.doSendPdu(echoPdu, session);
                resolve(echoPdu);
            }
        });
    }
}
