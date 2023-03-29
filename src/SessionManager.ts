import EventEmitter from "events";
import Logger from "./Logger";
import {SmppSession} from "./SmppSession";

export abstract class SessionManager {
	abstract sessions: SmppSession[];
	abstract sessionId: number;
	readonly abstract identifier: string;
	readonly abstract ManagedSessionClass: any;

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

	abstract cleanup(): void;

	abstract setup(): void;

	abstract getExisting(arg: any): Promise<SmppSession>;
}