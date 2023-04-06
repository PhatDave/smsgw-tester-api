import EventEmitter from "events";
import fs from "fs";
import Job from "./Job/Job";
import Logger from "./Logger";
import PduProcessor from "./PDUProcessor/PduProcessor";
import ProcessorManager from "./PDUProcessor/ProcessorManager";
import SmppSession from "./SmppSession";

export default abstract class SessionManager {
	// I could've done this by passing these abstract properties to the constructor, but I wanted to have the possibility
	// of implementing additional methods
	abstract comparatorFn: (arg: any, session: SmppSession) => boolean;
	readonly abstract identifier: string;
	readonly abstract ManagedSessionClass: any;
	readonly abstract StorageFile: string;
	readonly SESSION_ADDED_EVENT: string = "SESSION ADDED";

	sessions: SmppSession[] = [];
	sessionId: number = 0;
	readonly logger: Logger = new Logger("SessionManager");
	readonly eventEmitter: EventEmitter = new EventEmitter();

	addSession(session: SmppSession): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.logger.log1(`Adding session with id ${session.id}`);
			this.sessions.push(session);
			this.eventEmitter.emit(this.SESSION_ADDED_EVENT, session.id);
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
			this.logger.log1(`Removing session with id ${session.id}`);
			session.close();
			session.destroy();
			this.sessions = this.sessions.filter(s => s.id !== session.id);
			resolve();
		});
	}

	getSession(id: number): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Looking for session with id ${id}...`);
			let session: SmppSession | undefined = this.sessions.find(s => s.id == id);
			if (session) {
				this.logger.log1(`Found session with id ${id}`);
				resolve(session);
			} else {
				this.logger.log1(`Session with id ${id} not found`);
				reject(`Session with id ${id} not found`);
			}
		});
	}

	setup(): void {
		try {
			this.logger.log1(`Loading ${this.ManagedSessionClass.name} from ${this.StorageFile}`)
			let sessions: Buffer = fs.readFileSync(this.StorageFile);
			let loadedSessions: any[] = JSON.parse(String(sessions));
			this.logger.log1(`Loaded ${loadedSessions.length} clients from ${this.StorageFile}`);
			loadedSessions.forEach(session => {
				this.createSession(session.url || session.port, session.username, session.password).then((sessionObj: SmppSession) => {
					sessionObj.defaultSingleJob = Job.deserialize(session.defaultSingleJob);
					sessionObj.defaultMultipleJob = Job.deserialize(session.defaultMultipleJob);

					let loadedProcessors: PduProcessor[] = session.preprocessors.concat(session.postprocessors);
					sessionObj.appliedProcessors.forEach((processor: PduProcessor) => {
						if (!loadedProcessors.find(p => p.name === processor.name)) {
							ProcessorManager.detachProcessor(sessionObj, processor);
						}
					});
					loadedProcessors.forEach((processor: PduProcessor) => {
						if (!sessionObj.appliedProcessors.find(p => p.name === processor.name)) {
							ProcessorManager.attachProcessor(sessionObj, ProcessorManager.getProcessor(processor.name));
						}
					});
				});
			});
		} catch (e) {
			this.logger.log1(`Error loading centers from ${this.StorageFile}: ${e}`);
			return;
		}
	}

	createSession(arg: any, username: string, password: string): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Creating session of type ${this.ManagedSessionClass.name} with arg ${arg}`);
			this.getExisting(arg).then((s: SmppSession) => {
				resolve(s);
			}, err => {
			});
			this.verifyField(arg, reject);
			username = username || "";
			password = password || "";

			let session = new this.ManagedSessionClass(this.sessionId++, arg, username, password);
			this.addSession(session).then(() => {
				resolve(session);
			});
		});
	}

	verifyField(field: string, reject: (reason?: any) => void) {
		if (!field) {
			let error = `Request to make a new session failed because of missing ${field}.`;
			this.logger.log1(error);
			reject(error);
		}
	}

	cleanup(): void {
		this.logger.log1(`Saving centers to ${this.StorageFile}...`);
		fs.writeFileSync(this.StorageFile, JSON.stringify(this.serialize(), null, 4));
	}

	serialize(): object {
		this.logger.log1(`Serializing ${this.sessions.length} clients`);
		return this.sessions.map((session: SmppSession) => {
			return session.serialize();
		});
	}

	getExisting(arg: any): Promise<SmppSession> {
		return new Promise<SmppSession>((resolve, reject) => {
			this.logger.log1(`Looking for session with arg ${arg}...`);
			let session: SmppSession | undefined = this.sessions.find(this.comparatorFn.bind(this, arg));
			if (session) {
				this.logger.log1(`Found session with arg ${arg}`);
				resolve(session);
			} else {
				this.logger.log1(`Session with arg ${arg} not found`);
				reject(`Session with arg ${arg} not found`);
			}
		});
	}
}