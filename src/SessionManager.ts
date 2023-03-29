import EventEmitter from "events";
import fs from "fs";
import {Client} from "./Client/Client";
import {Job} from "./Job/Job";
import Logger from "./Logger";
import {SmppSession} from "./SmppSession";

export abstract class SessionManager {
	abstract sessions: SmppSession[];
	abstract sessionId: number;
	abstract comparatorFn: (arg: any, session: SmppSession) => boolean;
	readonly abstract identifier: string;
	readonly abstract ManagedSessionClass: any;
	readonly abstract StorageFile: string;

	readonly SESSION_ADDED_EVENT: string = "SESSION ADDED";
	readonly logger: Logger = new Logger("SessionManager");
	readonly eventEmitter: EventEmitter = new EventEmitter();

	addSession(session: SmppSession): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.logger.log1(`Adding session with id ${session.getId()}`);
			this.sessions.push(session);
			this.eventEmitter.emit(this.SESSION_ADDED_EVENT, session.getId());
			resolve();
		});
	}

	on(event: string, listener: (...args: any[]) => void): void {
		this.eventEmitter.on(event, listener);
	}

	getSessions(): Promise<SmppSession[]> {
		return Promise.resolve(this.sessions);
	}

	removeSession(session: SmppSession): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.logger.log1(`Removing session with id ${session.getId()}`);
			this.sessions = this.sessions.filter(s => s.getId() !== session.getId());
			resolve();
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

	serialize(): object {
		this.logger.log1(`Serializing ${this.sessions.length} clients`)
		return this.sessions.map((session: SmppSession) => {
			return session.serialize();
		});
	}

	// TODO: Maybe find a way to include write and read to file here too (instead of child classes)

	createSession(arg: any, username: string, password: string): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Creating session of type ${this.ManagedSessionClass.name} with arg ${arg}`);
			this.getExisting(arg).then((s: SmppSession) => {
				resolve(s);
			}, err => {
			});
			this.verifyField(arg, reject);
			this.verifyField(username, reject);
			this.verifyField(password, reject);

			let session = new this.ManagedSessionClass(this.sessionId++, arg, username, password);
			this.addSession(session).then(() => {
				resolve(session);
			});
		});
	}

	verifyField(field: string, reject: (reason?: any) => void) {
		if (!field) {
			let error = `Request to make a new client failed because of missing ${field}.`;
			this.logger.log1(error);
			reject(error);
		}
	}

	setup(): void {
		try {
			this.logger.log1(`Loading ${this.ManagedSessionClass.name} from ${this.StorageFile}`)
			let sessions: Buffer = fs.readFileSync(this.StorageFile);
			let loadedSessions: any[] = JSON.parse(String(sessions));
			this.logger.log1(`Loaded ${loadedSessions.length} clients from ${this.StorageFile}`);
			loadedSessions.forEach(session => {
				this.createSession(session.url, session.username, session.password).then((sessionObj: SmppSession) => {
					sessionObj.setDefaultSingleJob(Job.deserialize(session.defaultSingleJob));
					sessionObj.setDefaultMultipleJob(Job.deserialize(session.defaultMultipleJob));
				});
			});
		} catch (e) {
			this.logger.log1(`Error loading centers from ${this.StorageFile}: ${e}`);
			return;
		}
	}

	cleanup(): void {
		this.logger.log1(`Saving centers to ${this.StorageFile}...`);
		fs.writeFileSync(this.StorageFile, JSON.stringify(this.serialize(), null, 4));
	}
	getExisting(arg: any): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Looking for session with url ${arg}...`);
			// let session: SmppSession | undefined = this.sessions.find((s: Client) => s.getUrl() === arg);
			let session: SmppSession | undefined = this.sessions.find(this.comparatorFn.bind(this, arg));
			if (session) {
				this.logger.log1(`Found session with url ${arg}`);
				resolve(session);
			} else {
				this.logger.log1(`Session with url ${arg} not found`);
				reject(`Session with url ${arg} not found`);
			}
		});
	}
}