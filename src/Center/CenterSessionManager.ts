import Logger from "../Logger";
import {SessionManager} from "../SessionManager";
import {SmppSession} from "../SmppSession";
import {Center} from "./Center";

const CENTER_SESSIONS_FILE: string = process.env.CENTER_SESSIONS_FILE || "center_sessions.json";

export class CenterSessionManager extends SessionManager {
	StorageFile: string = CENTER_SESSIONS_FILE
	ManagedSessionClass: typeof Center = Center;
	sessionId: number = 0;
	sessions: Center[] = [];
	identifier: string = "center";
	readonly logger: Logger = new Logger("CenterSessionManager");

	constructor() {
		super();
		this.setup();
	}

	comparatorFn: (arg: any, session: SmppSession) => boolean = (arg: any, session: SmppSession) => (session as Center).getPort() === arg;
}