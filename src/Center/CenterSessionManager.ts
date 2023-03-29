import EventEmitter from "events";
import Logger from "../Logger";
import {SessionManager} from "../SessionManager";
import {SmppSession} from "../SmppSession";
import {Center} from "./Center";

const CENTER_SESSIONS_FILE: string = process.env.CENTER_SESSIONS_FILE || "center_sessions.json";

export class CenterSessionManager extends SessionManager {
	StorageFile: string = CENTER_SESSIONS_FILE
	ManagedSessionClass: any = Center;
	sessionId: number = 0;
	sessions: Center[] = [];
	identifier: string = "center";
	readonly logger: Logger = new Logger("CenterSessionManager");
	readonly eventEmitter: EventEmitter = new EventEmitter();

	constructor() {
		super();
		// super.eventEmitter.on(super.SESSION_ADDED_EVENT, (session: SmppSession) => this.eventEmitter.emit(this.SESSION_ADDED_EVENT, session));
	}

	comparatorFn: (arg: any, session: SmppSession) => boolean = (arg: any, session: SmppSession) => (session as Center).getPort() === arg;

	createSession(port: number, username: string, password: string): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Creating session with port ${port}`);
			this.getExisting(port).then(s => {
				resolve(s);
			}, err => {
			});
			this.verifyPort(port, reject);
			// this.verifyUsername(username, reject);
			// this.verifyPassword(password, reject);

			let client = new Center(this.sessionId++, port, username, password);
			this.addSession(client).then(() => {
				resolve(client);
			});
		});
	}

	getExisting(arg: any): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Looking for session with port ${arg}...`);
			let session: SmppSession | undefined = this.sessions.find((s: Center) => s.getPort() === arg);
			if (session) {
				this.logger.log1(`Found session with port ${arg}`);
				resolve(session);
			} else {
				this.logger.log1(`Session with port ${arg} not found`);
				reject(`Session with port ${arg} not found`);
			}
		});
	}

	private verifyPort(port: number, reject: (reason?: any) => void) {
		if (!port) {
			let error = `Request to make a new center failed because of missing port.`;
			this.logger.log1(error);
			reject(error);
		}
	}
}