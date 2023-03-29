import EventEmitter from "events";
import Logger from "../Logger";
import {SessionManager} from "../SessionManager";
import {SmppSession} from "../SmppSession";
import {Client} from "./Client";

const CLIENT_SESSIONS_FILE: string = process.env.CLIENT_SESSIONS_FILE || "client_sessions.json";

export default class ClientSessionManager extends SessionManager {
	ManagedSessionClass: any = Client;
	sessionId: number = 0;
	sessions: Client[] = [];
	// Identifier is used in websockets to identify the type of session this manager manages
	identifier: string = "client";
	readonly logger: Logger = new Logger("ClientSessionManager");
	readonly eventEmitter: EventEmitter = new EventEmitter();

	constructor() {
		super();
		// super.eventEmitter.on(super.SESSION_ADDED_EVENT, (session: SmppSession) => this.eventEmitter.emit(this.SESSION_ADDED_EVENT, session));
	}

	// TODO: Move this to superclass too
	getExisting(arg: any): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Looking for session with url ${arg}...`);
			let session: SmppSession | undefined = this.sessions.find((s: Client) => s.getUrl() === arg);
			if (session) {
				this.logger.log1(`Found session with url ${arg}`);
				resolve(session);
			} else {
				this.logger.log1(`Session with url ${arg} not found`);
				reject(`Session with url ${arg} not found`);
			}
		});
	}

	cleanup(): void {
		throw new Error("Method not implemented.");
	}

	setup(): void {
		throw new Error("Method not implemented.");
	}

	// setup(): void {
	// 	try {
	// 		this.logger.log1(`Loading clients from ${CLIENT_SESSIONS_FILE}`)
	// 		let sessions: Buffer = fs.readFileSync(CLIENT_SESSIONS_FILE);
	// 		let loadedSessions: any[] = JSON.parse(String(sessions));
	// 		this.logger.log1(`Loaded ${loadedSessions.length} clients from ${CLIENT_SESSIONS_FILE}`);
	// 		loadedSessions.forEach(session => {
	// 			this.createSession(session.url, session.username, session.password).then((sessionObj: SmppSession) => {
	// 				sessionObj.setDefaultSingleJob(Job.deserialize(session.defaultSingleJob));
	// 				sessionObj.setDefaultMultipleJob(Job.deserialize(session.defaultMultipleJob));
	// 			});
	// 		});
	// 	} catch (e) {
	// 		this.logger.log1(`Error loading clients from ${CLIENT_SESSIONS_FILE}: ${e}`);
	// 		return;
	// 	}
	// }
	//
	// cleanup(): void {
	// 	this.logger.log1(`Saving clients to ${CLIENT_SESSIONS_FILE}...`);
	// 	fs.writeFileSync(CLIENT_SESSIONS_FILE, JSON.stringify(this.serialize(), null, 4));
	// }
}