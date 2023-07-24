import Center from "../../../Center/Center";
import Postprocessor from "../Postprocessor";

const smpp = require("smpp");

export default class BindTranscieverReplyProcessor extends Postprocessor {
    applicableCommands: string[] = ['bind_transceiver'];

    constructor(type: string) {
        super(type);
    }

    doProcess(session: any, pdu: any, entity?: Center | undefined): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!entity) {
                reject();
            }

            this.logger.log1(`Center-${entity?.id} got a bind_transceiver with system_id ${pdu.system_id} and password ${pdu.password}`);
            session.pause();
            if (pdu.system_id === entity?.username && pdu.password === entity?.password) {
                this.logger.log1(`Center-${entity?.id} client connection successful`);
                if (pdu.response) {
                    entity?.doSendPdu(pdu.response(), session);
                }
                session.resume();
                // @ts-ignore
                entity?.pendingSessions = entity?.pendingSessions.filter((s) => s !== session);
                entity?.sessions.push(session);
                entity?.updateStatus();
            } else {
                this.logger.log1(`Center-${entity?.id} client connection failed, invalid credentials (expected: ${entity?.username}, ${entity?.password})`);
                if (pdu.response) {
                    entity?.doSendPdu(pdu.response({
                        command_status: smpp.ESME_RBINDFAIL
                    }), session);
                }
                // @ts-ignore
                entity?.pendingSessions = entity?.pendingSessions.filter((s) => s !== session);
                entity?.updateStatus();
                session.close();
            }
        });
    }
}
