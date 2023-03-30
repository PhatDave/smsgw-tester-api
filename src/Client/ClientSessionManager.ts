import Logger from "../Logger";
import {SessionManager} from "../SessionManager";
import {SmppSession} from "../SmppSession";
import {Client} from "./Client";

const CLIENT_SESSIONS_FILE: string = process.env.CLIENT_SESSIONS_FILE || "client_sessions.json";

export default class ClientSessionManager extends SessionManager {
	StorageFile: string = CLIENT_SESSIONS_FILE;
	ManagedSessionClass: typeof Client = Client;
	sessionId: number = 0;
	sessions: Client[] = [];
	// Identifier is used in websockets to identify the type of session this manager manages
	identifier: string = "client";
	readonly logger: Logger = new Logger("ClientSessionManager");

	constructor() {
		super();
		this.setup();
		// super.eventEmitter.on(super.SESSION_ADDED_EVENT, (session: SmppSession) => this.eventEmitter.emit(this.SESSION_ADDED_EVENT, session));
	}

	comparatorFn: (arg: any, session: SmppSession) => boolean = (arg: any, session: SmppSession) => (session as Client).getUrl() === arg;
}