import fs from "fs";
import {Client} from "./Client";
import {Job} from "./Job";
import Logger from "./Logger";
import SessionManager from "./SessionManager";
import {SmppSession} from "./SmppSession";

const CLIENT_SESSIONS_FILE: string = process.env.CLIENT_SESSIONS_FILE || "client_sessions.json";

export default class ClientSessionManager implements SessionManager {
	sessionId: number;
	sessions: Client[];
	private readonly logger: any;

	constructor() {
		this.sessionId = 0;
		this.sessions = [];
		this.logger = new Logger("ClientSessionManager");
	}

	addSession(session: SmppSession): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.sessions.push(session as Client);
			resolve();
		});
	}

	removeSession(session: SmppSession): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.sessions = this.sessions.filter(s => s.getId() !== session.getId());
			resolve();
		});
	}

	// TODO: Make sure no url duplicates exist
	createSession(url: string, username: string, password: string): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.verifyUrl(url, reject);
			this.verifyUsername(username, reject);
			this.verifyPassword(password, reject);

			let client = new Client(this.sessionId++, url, username, password);
			this.addSession(client).then(() => {
				resolve(client);
			});
		});
	}

	getSession(id: number): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			let session: SmppSession | undefined = this.sessions.find(s => s.getId() === id);
			if (session) {
				resolve(session);
			} else {
				reject(`Session with id ${id} not found`);
			}
		});
	}

	getSessionByUrl(url: string): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			let session: SmppSession | undefined = this.sessions.find(s => s.getUrl() === url);
			if (session) {
				resolve(session);
			} else {
				reject(`Session with url ${url} not found`);
			}
		});
	}

	serialize(): object {
		return this.sessions.map((session: SmppSession) => {
			return session.serialize();
		});
	}

	setup(): void {
		try {
			let sessions: Buffer = fs.readFileSync(CLIENT_SESSIONS_FILE);
			let loadedSessions: any[] = JSON.parse(String(sessions));
			this.logger.log1(`Loaded ${sessions.length} clients from ${CLIENT_SESSIONS_FILE}...`);
			loadedSessions.forEach(session => {
				this.createSession(session.url, session.username, session.password).then((sessionObj: SmppSession) => {
					sessionObj.setDefaultSingleJob(Job.deserialize(session.defaultSingleJob));
					sessionObj.setDefaultMultipleJob(Job.deserialize(session.defaultMultipleJob));
				});
			});
		} catch (e) {
			this.logger.log1(`Error loading clients from ${CLIENT_SESSIONS_FILE}: ${e}`);
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

	private verifyUsername(username: string, reject: (reason?: any) => void) {
		if (!username) {
			let error = `Request to make a new client failed because of missing username.`;
			this.logger.log1(error);
			reject(error);
		}
	}

	private verifyPassword(password: string, reject: (reason?: any) => void) {
		if (!password) {
			let error = `Request to make a new client failed because of missing password.`;
			this.logger.log1(error);
			reject(error);
		}
	}
}