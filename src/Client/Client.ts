import {Job} from "../Job/Job";
import Logger from "../Logger";
import {PduProcessor} from "../PDUProcessor/PduProcessor";
import PersistentPromise from "../PersistentPromise";
import {SmppSession} from "../SmppSession";

const NanoTimer = require('nanotimer');
const smpp = require("smpp");

const AUTO_ENQUIRE_LINK_PERIOD: number = Number(process.env.AUTO_ENQUIRE_LINK_PERIOD) || 30000;

export class Client extends SmppSession {
	readonly STATUS: string[] = [
		"NOT CONNECTED",
		"CONNECTING",
		"CONNECTED",
		"BINDING",
		"BOUND",
		"BUSY",
	]

	id: number;
	username: string;
	password: string;
	status: string = this.STATUS[0];
	url: string;

	pduProcessors: PduProcessor[] = [];
	defaultSingleJob!: Job;
	defaultMultipleJob!: Job;
	readonly logger: Logger;
	private session?: any;
	private connectPromise: PersistentPromise | null = null;
	private bindPromise: PersistentPromise | null = null;
	private closePromise: PersistentPromise | null = null;
	// TODO: Implement close promise
	// Apparently the sessions are not closed on a dime but instead a .close() call causes eventSessionClose

	constructor(id: number, url: string, username: string, password: string) {
		super();
		this.id = id;
		this.username = username;
		this.password = password;
		this.url = url;

		this.defaultSingleJob = Job.createEmptySingle();
		this.defaultMultipleJob = Job.createEmptyMultiple();

		this.logger = new Logger(`Client-${id}`);
	}

	doConnect(): PersistentPromise {
		this.connectPromise = new PersistentPromise((resolve, reject) => {
			if (this.status !== this.STATUS[0]) {
				let errorString = `Client-${this.getId()} already connected`;
				this.logger.log1(errorString);
				reject(errorString);
				return;
			}

			this.logger.log1(`Client-${this.getId()} connecting to ${this.url}`);
			this.setStatus(1);
			this.connectSession().then(resolve, ((err: any) => {
				this.logger.log1(`Client-${this.getId()} connection failed: ${err}`);
				this.setStatus(0);
				this.session.close();
				reject(err);
			}));
		});
		return this.connectPromise;
	}

	doBind(): PersistentPromise {
		this.bindPromise = new PersistentPromise((resolve, reject) => {
			this.validateFields(reject);

			this.session.bind_transceiver({
				system_id: this.username,
				password: this.password,
			}, this.eventBindReply.bind(this));
			this.setStatus(3);
		});
		return this.bindPromise;
	}

	connectAndBind(): Promise<void> {
		return this.doConnect().then(this.doBind.bind(this), (error) => {
			this.logger.log1(`Client-${this.getId()} connectAndBind failed: ${error}`);
		});
	}

	serialize(): object {
		return {
			id: this.getId(),
			url: this.url,
			username: this.username,
			password: this.password,
			status: this.status,
			defaultSingleJob: this.defaultSingleJob.serialize(),
			defaultMultipleJob: this.defaultMultipleJob.serialize(),
			processors: this.pduProcessors.map(p => p.serialize()),
		};
	}

	close(): Promise<void> {
		this.logger.log1(`Client-${this.getId()} closing connection`);
		return Promise.resolve(this.session.close());
	}

	sendPdu(pdu: object, force?: boolean): Promise<object> {
		return new Promise((resolve, reject) => {
			if (!force) {
				this.validateSession(reject);
				this.validateBound(reject);
			}
			this.logger.log5(`Client-${this.getId()} sending PDU: ${JSON.stringify(pdu)}`);
			this.session.send(pdu, (replyPdu: object) => resolve(replyPdu));
		});
	}

	sendMultiple(job: Job): Promise<void> {
		return new Promise((resolve, reject) => {
			this.validateSession(reject);
			this.validateBound(reject);
			if (!job.count || !job.perSecond) {
				reject(`Client-${this.getId()} sendMultiple failed: invalid job, missing fields`);
			}
			this.logger.log1(`Client-${this.getId()} sending multiple messages: ${JSON.stringify(job)}`);

			this.setStatus(4);

			let counter = 0;
			let previousUpdateCounter = 0;

			this.counterUpdateTimer.setInterval(() => {
				if (previousUpdateCounter !== counter) {
					this.eventEmitter.emit(this.EVENT.MESSAGE_SEND_COUNTER_UPDATE_EVENT, counter);
					previousUpdateCounter = counter;
				}
			}, '', `${this.MESSAGE_SEND_UPDATE_DELAY / 1000} s`);

			let count = job.count || 1;
			let interval = 1 / (job.perSecond || 1);
			this.sendTimer.setInterval(() => {
				if (count > 0 && counter >= count) {
					this.cancelSendInterval();
				} else {
					this.sendPdu(job.pdu, true)
						.catch(e => this.logger.log1(`Error sending message: ${e}`));
					counter++;
				}
			}, '', `${interval} s`);
			resolve();
		});
	}

	getUrl(): string {
		return this.url;
	}

	private connectSession(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.validateFields(reject);
			this.logger.log1(`Client-${this.getId()} connecting to ${this.url}`);

			this.session = smpp.connect({
				url: this.url, auto_enquire_link_period: AUTO_ENQUIRE_LINK_PERIOD,
			}, this.eventSessionConnected.bind(this));
			this.session.on('error', this.eventSessionError.bind(this));
			this.session.on('close', this.eventSessionClose.bind(this));
			this.session.on('pdu', this.eventAnyPdu.bind(this));
		});
	}

	private eventSessionConnected(): void {
		this.logger.log1(`Client-${this.getId()} connected to ${this.url}`);
		this.setStatus(2);
		if (this.connectPromise) {
			this.connectPromise.resolve();
		}
	}

	private eventSessionError(pdu: any): void {
		this.logger.log1(`Client-${this.getId()} error on ${this.url}`);
		this.setStatus(0);
		this.rejectPromises();
	}

	private eventSessionClose(): void {
		this.logger.log1(`Client-${this.getId()} closed on ${this.url}`);
		this.setStatus(0);
		this.rejectPromises();
	}

	private eventBindReply(pdu: any): void {
		if (pdu.command_status === 0) {
			this.logger.log1(`Client-${this.getId()} bound to ${this.url}`);
			this.setStatus(4);
			if (this.bindPromise) {
				this.bindPromise.resolve();
			}
		} else {
			this.logger.log1(`Client-${this.getId()} bind failed to ${this.url}`);
			this.setStatus(2);
			if (this.bindPromise) {
				this.bindPromise.reject(pdu);
			}
		}
	}

	private rejectPromises(err?: any): void {
		if (this.connectPromise) {
			this.connectPromise.reject(err);
		}
		if (this.bindPromise) {
			this.bindPromise.reject(err);
		}
		if (this.closePromise) {
			this.closePromise.resolve();
		}
	}

	private validateFields(reject: (reason?: any) => void) {
		if (!this.url) {
			let error = `Client-${this.getId()} has no url set`;
			this.logger.log1(error);
			reject(error);
		}
		if (!this.username) {
			let error = `Client-${this.getId()} has no username set`;
			this.logger.log1(error);
			reject(error);
		}
		if (!this.password) {
			let error = `Client-${this.getId()} has no password set`;
			this.logger.log1(error);
			reject(error);
		}
	}

	private validateSession(reject: (reason?: any) => void) {
		if (!this.session) {
			let errorMessage = `Client-${this.getId()} session is not defined`;
			this.logger.log1(errorMessage);
			reject(errorMessage);
		}
	}

	private validateBound(reject: (reason?: any) => void) {
		if (this.status !== this.STATUS[4]) {
			let errorMessage = `Client-${this.getId()} is not bound`;
			this.logger.log1(errorMessage);
			reject(errorMessage);
		}
	}
}