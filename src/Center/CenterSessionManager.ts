import EventEmitter from "events";
import fs from "fs";
import {Job} from "../Job/Job";
import Logger from "../Logger";
import {SessionManager} from "../SessionManager";
import {SmppSession} from "../SmppSession";
import {Center} from "./Center";

const CENTER_SESSIONS_FILE: string = process.env.CENTER_SESSIONS_FILE || "center_sessions.json";

export class CenterSessionManager extends SessionManager {
	sessionId: number = 0;
	sessions: Center[] = [];
	identifier: string = "center";
	readonly logger: Logger = new Logger("CenterSessionManager");
	readonly eventEmitter: EventEmitter = new EventEmitter();

	constructor() {
		super();
		// super.eventEmitter.on(super.SESSION_ADDED_EVENT, (session: SmppSession) => this.eventEmitter.emit(this.SESSION_ADDED_EVENT, session));
	}

	setup(): void {
		try {
			this.logger.log1(`Loading clients from ${CENTER_SESSIONS_FILE}`)
			let sessions: Buffer = fs.readFileSync(CENTER_SESSIONS_FILE);
			let loadedSessions: any[] = JSON.parse(String(sessions));
			this.logger.log1(`Loaded ${loadedSessions.length} clients from ${CENTER_SESSIONS_FILE}`);
			loadedSessions.forEach(session => {
				this.createSession(session.url, session.username, session.password).then((sessionObj: SmppSession) => {
					sessionObj.setDefaultSingleJob(Job.deserialize(session.defaultSingleJob));
					sessionObj.setDefaultMultipleJob(Job.deserialize(session.defaultMultipleJob));
				});
			});
		} catch (e) {
			this.logger.log1(`Error loading clients from ${CENTER_SESSIONS_FILE}: ${e}`);
			return;
		}
	}

	cleanup(): void {
		this.logger.log1(`Saving clients to ${CENTER_SESSIONS_FILE}...`);
		fs.writeFileSync(CENTER_SESSIONS_FILE, JSON.stringify(this.serialize(), null, 4));
	}

	createSession(port: number, username: string, password: string): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Creating session with port ${port}`);
			this.getSessionByPort(port).then(s => {
				resolve(s);
			}, err => {
			});
			this.verifyPort(port, reject);
			this.verifyUsername(username, reject);
			this.verifyPassword(password, reject);

			let client = new Center(this.sessionId++, port, username, password);
			this.addSession(client).then(() => {
				resolve(client);
			});
		});
	}

	getSessionByPort(port: number): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Looking for session with port ${port}...`);
			let session: SmppSession | undefined = this.sessions.find((s: Center) => s.getPort() === port);
			if (session) {
				this.logger.log1(`Found session with port ${port}`);
				resolve(session);
			} else {
				this.logger.log1(`Session with port ${port} not found`);
				reject(`Session with port ${port} not found`);
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