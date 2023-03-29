import EventEmitter from "events";
import fs from "fs";
import {Job} from "../Job/Job";
import Logger from "../Logger";
import {SessionManager} from "../SessionManager";
import {SmppSession} from "../SmppSession";
import {Client} from "./Client";

const CLIENT_SESSIONS_FILE: string = process.env.CLIENT_SESSIONS_FILE || "client_sessions.json";

export default class ClientSessionManager extends SessionManager {
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

	createSession(url: string, username: string, password: string): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Creating session with url ${url}`);
			this.getSessionByUrl(url).then(s => {
				resolve(s);
			}, err => {
			});
			this.verifyUrl(url, reject);
			this.verifyUsername(username, reject);
			this.verifyPassword(password, reject);

			let client = new Client(this.sessionId++, url, username, password);
			this.addSession(client).then(() => {
				resolve(client);
			});
		});
	}

	getSessionByUrl(url: string): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Looking for session with url ${url}...`);
			let session: SmppSession | undefined = this.sessions.find((s: Client) => s.getUrl() === url);
			if (session) {
				this.logger.log1(`Found session with url ${url}`);
				resolve(session);
			} else {
				this.logger.log1(`Session with url ${url} not found`);
				reject(`Session with url ${url} not found`);
			}
		});
	}

	setup(): void {
		try {
			this.logger.log1(`Loading clients from ${CLIENT_SESSIONS_FILE}`)
			let sessions: Buffer = fs.readFileSync(CLIENT_SESSIONS_FILE);
			let loadedSessions: any[] = JSON.parse(String(sessions));
			this.logger.log1(`Loaded ${loadedSessions.length} clients from ${CLIENT_SESSIONS_FILE}`);
			loadedSessions.forEach(session => {
				this.createSession(session.url, session.username, session.password).then((sessionObj: SmppSession) => {
					sessionObj.setDefaultSingleJob(Job.deserialize(session.defaultSingleJob));
					sessionObj.setDefaultMultipleJob(Job.deserialize(session.defaultMultipleJob));
				});
			});
		} catch (e) {
			this.logger.log1(`Error loading clients from ${CLIENT_SESSIONS_FILE}: ${e}`);
			return;
		}
	}

	cleanup(): void {
		this.logger.log1(`Saving clients to ${CLIENT_SESSIONS_FILE}...`);
		fs.writeFileSync(CLIENT_SESSIONS_FILE, JSON.stringify(this.serialize(), null, 4));
	}

	private verifyUrl(url: string, reject: (reason?: any) => void) {
		if (!url) {
			let error = `Request to make a new client failed because of missing url.`;
			this.logger.log1(error);
			reject(error);
		}
	}
}