import EventEmitter from "events";
import fs from "fs";
import {Client} from "./Client";
import {Job} from "../Job/Job";
import Logger from "../Logger";
import SessionManager from "../SessionManager";
import {SmppSession} from "../SmppSession";

const CLIENT_SESSIONS_FILE: string = process.env.CLIENT_SESSIONS_FILE || "client_sessions.json";

export default class ClientSessionManager implements SessionManager {
	sessionId: number;
	sessions: Client[];
	identifier: string = "client";
	private readonly logger: any;
	readonly SESSION_ADDED_EVENT: string = "SESSION ADDED";
	private readonly eventEmitter: EventEmitter = new EventEmitter();

	constructor() {
		this.sessionId = 0;
		this.sessions = [];
		this.logger = new Logger("ClientSessionManager");
	}

	on(event: string, listener: (...args: any[]) => void): void {
        this.eventEmitter.on(event, listener);
    }

	getSessions(): Promise<SmppSession[]> {
        return new Promise<SmppSession[]>(resolve => {
			resolve(this.sessions);
        });
    }

	addSession(session: SmppSession): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.logger.log1(`Adding session with id ${session.getId()}`);
			this.sessions.push(session as Client);
			this.eventEmitter.emit(this.SESSION_ADDED_EVENT, session.getId());
			resolve();
		});
	}

	removeSession(session: SmppSession): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.logger.log1(`Removing session with id ${session.getId()}`);
			this.sessions = this.sessions.filter(s => s.getId() !== session.getId());
			resolve();
		});
	}

	createSession(url: string, username: string, password: string): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Creating session with url ${url}`);
			this.getSessionByUrl(url).then(s => {
				resolve(s);
			}, err => {});
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
			this.logger.log1(`Looking for session with id ${id}...`);
			let session: SmppSession | undefined = this.sessions.find(s => s.getId() === id);
			if (session) {
				this.logger.log1(`Found session with id ${id}`);
				resolve(session);
			} else {
				this.logger.log1(`Session with id ${id} not found`);
				reject(`Session with id ${id} not found`);
			}
		});
	}

	getSessionByUrl(url: string): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Looking for session with url ${url}...`);
			let session: SmppSession | undefined = this.sessions.find(s => s.getUrl() === url);
			if (session) {
				this.logger.log1(`Found session with url ${url}`);
				resolve(session);
			} else {
				this.logger.log1(`Session with url ${url} not found`);
				reject(`Session with url ${url} not found`);
			}
		});
	}

	serialize(): object {
		this.logger.log1(`Serializing ${this.sessions.length} clients`)
		return this.sessions.map((session: SmppSession) => {
			return session.serialize();
		});
	}

	setup(): void {
		try {
			this.logger.log1(`Loading clients from ${CLIENT_SESSIONS_FILE}`)
			let sessions: Buffer = fs.readFileSync(CLIENT_SESSIONS_FILE);
			let loadedSessions: any[] = JSON.parse(String(sessions));
			this.logger.log1(`Loaded ${sessions.length} clients from ${CLIENT_SESSIONS_FILE}`);
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