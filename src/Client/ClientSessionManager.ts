import Logger from "../Logger";
import SessionManager from "../SessionManager";
import SmppSession from "../SmppSession";
import Client from "./Client";

const CLIENT_SESSIONS_FILE: string = process.env.CLIENT_SESSIONS_FILE || "client_sessions.json";

export default class ClientSessionManager extends SessionManager {
    StorageFile: string = CLIENT_SESSIONS_FILE;
    ManagedSessionClass: typeof Client = Client;
    identifier: string = "Client";
    readonly logger: Logger = new Logger("ClientSessionManager");

    constructor() {
        super();
        this.setup();
    }

    comparatorFn: (arg: any, session: SmppSession) => boolean = (arg: any, session: SmppSession) => (session as Client).url === arg;
}
