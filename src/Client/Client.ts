import {PDU} from "../CommonObjects";
import {Job} from "../Job/Job";
import Logger from "../Logger";
import {PduProcessor} from "../PDUProcessor/PduProcessor";
import {DeliverSmReplyProcessor} from "../PDUProcessor/Postprocessor/Client/DeliverSmReplyProcessor";
import ProcessorManager from "../PDUProcessor/ProcessorManager";
import PersistentPromise from "../PersistentPromise";
import {SmppSession} from "../SmppSession";

const NanoTimer = require('nanotimer');
const smpp = require("smpp");

const AUTO_ENQUIRE_LINK_PERIOD: number = Number(process.env.AUTO_ENQUIRE_LINK_PERIOD) || 30000;

export class Client extends SmppSession {
	readonly STATUSES: string[] = [
		"NOT CONNECTED",
		"CONNECTING",
		"CONNECTED",
		"BINDING",
		"BOUND",
		"BUSY",
	]
	url: string;
	_username: string;
	_password: string;
	_id: number;
	_status: string = this.STATUSES[0];
	pduProcessors: PduProcessor[] = [];
	readonly logger: Logger;
	private session?: any;
	private connectPromise: PersistentPromise | null = null;
	private bindPromise: PersistentPromise | null = null;
	private closePromise: PersistentPromise | null = null;

	constructor(id: number, url: string, username: string, password: string) {
		super();
		this._id = id;
		this._username = username;
		this._password = password;
		this.url = url;

		this._defaultSingleJob = Job.createEmptySingle('submit_sm');
		this._defaultMultipleJob = Job.createEmptyMultiple('submit_sm');

		this.logger = new Logger(`Client-${id}`);
	}

	_defaultSingleJob: Job;

	get defaultSingleJob(): Job {
		return this._defaultSingleJob;
	}

	set defaultSingleJob(job: Job) {
		if (job.pdu && !job.pdu.command) {
			job.pdu.command = 'submit_sm';
		}
		super.defaultSingleJob = job;
	}

	_defaultMultipleJob: Job;

	get defaultMultipleJob(): Job {
		return this._defaultMultipleJob;
	}

	set defaultMultipleJob(job: Job) {
		if (job.pdu && !job.pdu.command) {
			job.pdu.command = 'submit_sm';
		}
		super.defaultMultipleJob = job;
	}

	doConnect(): PersistentPromise {
		this.connectPromise = new PersistentPromise((resolve, reject) => {
			if (this.status !== this.STATUSES[0]) {
				let errorString = `Client-${this.id} already connected`;
				this.logger.log1(errorString);
				reject(errorString);
				return;
			}

			this.logger.log1(`Client-${this.id} connecting to ${this.url}`);
			this.setStatus(1);
			this.connectSession().then(resolve, ((err: any) => {
				this.logger.log1(`Client-${this.id} connection failed: ${err}`);
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
			this.logger.log1(`Client-${this.id} connectAndBind failed: ${error}`);
		});
	}

	serialize(): object {
		return {
			id: this._id,
			url: this.url,
			username: this._username,
			password: this._password,
			status: this._status,
			defaultSingleJob: this._defaultSingleJob.serialize(),
			defaultMultipleJob: this._defaultMultipleJob.serialize(),
			processors: this.pduProcessors.map(p => p.serialize()),
			availableProcessors: ProcessorManager.getProcessorsForType(this.constructor.name)
		};
	}

	close(): Promise<void> {
		this.logger.log1(`Client-${this.id} closing connection`);
		return Promise.resolve(this.session.close());
	}

	sendPdu(pdu: any, force?: boolean): Promise<object> {
		return new Promise((resolve, reject) => {
			if (!force) {
				this.validateSession(reject);
				this.validateBound(reject);
			}
			let pduCopy = new smpp.PDU(pdu.command, {...pdu})
			this.pduProcessors.forEach((processor: PduProcessor) => processor.processPdu(this.session, pduCopy));
			this.logger.log5(`Client-${this.id} sending PDU: ${JSON.stringify(pduCopy)}`);
			this.session.send(pduCopy, (replyPdu: object) => resolve(replyPdu));
		});
	}

	sendMultiple(job: Job): Promise<void> {
		return new Promise((resolve, reject) => {
			this.validateSession(reject);
			this.validateBound(reject);
			if (!job.count || !job.perSecond) {
				reject(`Client-${this.id} sendMultiple failed: invalid job, missing fields`);
			}
			this.logger.log1(`Client-${this.id} sending multiple messages: ${JSON.stringify(job)}`);

			this.setStatus(4);

			let counter: number = 0;
			let previousUpdateCounter: number = 0;

			this.counterUpdateTimer.setInterval(() => {
				if (previousUpdateCounter !== counter) {
					this.eventEmitter.emit(this.EVENT.MESSAGE_SEND_COUNTER_UPDATE_EVENT, counter);
					previousUpdateCounter = counter;
				}
			}, '', `${this.MESSAGE_SEND_UPDATE_DELAY / 1000} s`);

			let count: number = job.count || 1;
			let interval: number = 1 / (job.perSecond || 1);
			this.setStatus(5);
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

	private connectSession(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.validateFields(reject);
			this.logger.log1(`Client-${this.id} connecting to ${this.url}`);

			this.session = smpp.connect({
				url: this.url, auto_enquire_link_period: AUTO_ENQUIRE_LINK_PERIOD,
			}, this.eventSessionConnected.bind(this));
			this.session.on('error', this.eventSessionError.bind(this));
			this.session.on('close', this.eventSessionClose.bind(this));
			this.session.on('pdu', this.eventAnyPdu.bind(this));
		});
	}

	private eventSessionConnected(): void {
		this.logger.log1(`Client-${this.id} connected to ${this.url}`);
		this.setStatus(2);
		if (this.connectPromise) {
			this.connectPromise.resolve();
		} else {
			this.logger.log1(`Client-${this.id} connected without connect promise`);
		}
	}

	private eventSessionError(pdu: any): void {
		this.logger.log1(`Client-${this.id} error on ${this.url} - ${pdu.message}`);
		this.setStatus(0);
		this.rejectPromises();
	}

	private eventSessionClose(): void {
		this.logger.log1(`Client-${this.id} closed on ${this.url}`);
		this.setStatus(0);
		this.rejectPromises();
	}

	private eventBindReply(pdu: PDU): void {
		if (pdu.command_status === 0) {
			this.logger.log1(`Client-${this.id} bound to ${this.url}`);
			this.setStatus(4);
			if (this.bindPromise) {
				this.bindPromise.resolve();
			}
		} else {
			this.logger.log1(`Client-${this.id} bind failed to ${this.url}`);
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
			let error = `Client-${this.id} has no url set`;
			this.logger.log1(error);
			reject(error);
		}
		if (!this.username) {
			let error = `Client-${this.id} has no username set`;
			this.logger.log1(error);
			reject(error);
		}
		if (!this.password) {
			let error = `Client-${this.id} has no password set`;
			this.logger.log1(error);
			reject(error);
		}
	}

	private validateSession(reject: (reason?: any) => void) {
		if (!this.session) {
			let errorMessage = `Client-${this.id} session is not defined`;
			this.logger.log1(errorMessage);
			reject(errorMessage);
		}
	}

	private validateBound(reject: (reason?: any) => void) {
		if (this.status !== this.STATUSES[4]) {
			let errorMessage = `Client-${this.id} is not bound`;
			this.logger.log1(errorMessage);
			reject(errorMessage);
		}
	}

	eventAnyPdu(session: any, pdu: any): Promise<any> {
		this.eventEmitter.emit(this.EVENT.ANY_PDU, pdu);
		return Promise.resolve();
	}
}