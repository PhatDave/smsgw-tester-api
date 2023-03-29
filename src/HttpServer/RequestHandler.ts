import {Job} from "../Job/Job";
import Logger from "../Logger";
import {SessionManager} from "../SessionManager";
import {SmppSession} from "../SmppSession";

export abstract class RequestHandler {
	abstract sessionManager: SessionManager;
	logger: Logger = new Logger(this.constructor.name);

	doGet(req: any, res: any): void {
		this.logger.log1("Getting client sessions");
		res.send(this.sessionManager.serialize());
	}

	doGetById(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			this.logger.log1(`Client session found with ID ${req.params.id}`)
			res.send(session.serialize());
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doPatch(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			this.logger.log1(`Session found with ID ${req.params.id}`)
			if (!!req.body.username && req.body.username !== session.username) {
				session.setUsername(req.body.username);
			}
			if (!!req.body.password && req.body.password !== session.password) {
				session.setPassword(req.body.password);
			}
			res.send(session.serialize());
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doConfigureSingleJob(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			let job: Job = session.getDefaultSingleJob();
			if (job.pdu.source_addr && job.pdu.source_addr !== req.body.source) {
				job.pdu.source_addr = req.body.source;
			}
			if (job.pdu.destination_addr && job.pdu.destination_addr !== req.body.destination) {
				job.pdu.destination_addr = req.body.destination;
			}
			if (job.pdu.short_message && job.pdu.short_message !== req.body.message) {
				job.pdu.short_message = req.body.message;
			}
			this.logger.log1(`Updating default job on session with ID ${req.params.id}`)
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doSendSingleJob(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			this.logger.log1(`Sending pre-configured message on session with ID ${req.params.id}`)
			session.sendSingleDefault()
				.then(pdu => res.send(pdu),
					err => res.status(400).send({
						err: true,
						message: err
					}));
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doSend(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			this.logger.log1(`Sending message on session with ID ${req.params.id}`)
			let tempJob: Job = JSON.parse(JSON.stringify(session.defaultSingleJob));
			tempJob.pdu.source_addr = req.body.source;
			tempJob.pdu.destination_addr = req.body.destination;
			tempJob.pdu.short_message = req.body.message;
			session.sendSingle(tempJob)
				.then(pdu => res.send(pdu),
					err => res.status(400).send({
						err: true,
						message: err
					}));
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doConfigureManyJob(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			let perSecond: number = 1 / (req.body.interval / 1000)
			let job: Job = session.getDefaultMultipleJob();
			if (!job.pdu.source_addr && job.pdu.source_addr !== req.body.source) {
				job.pdu.source_addr = req.body.source;
			}
			if (!job.pdu.destination_addr && job.pdu.destination_addr !== req.body.destination) {
				job.pdu.destination_addr = req.body.destination;
			}
			if (!job.pdu.short_message && job.pdu.short_message !== req.body.message) {
				job.pdu.short_message = req.body.message;
			}
			if (!job.perSecond && job.perSecond !== perSecond) {
				job.perSecond = perSecond;
			}
			if (!job.count && job.count !== req.body.count) {
				job.count = req.body.count;
			}
			this.logger.log1(`Updating default job on session with ID ${req.params.id}`)
			res.send(session.serialize());
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doSendManyJob(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			this.logger.log1(`Sending pre-configured messages on session with ID ${req.params.id}`)
			session.sendMultipleDefault()
				.then(() => res.send({}),
					err => res.status(400).send({
						err: true,
						message: err
					}));
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doSendMany(req: any, res: any) {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			this.logger.log1(`Sending message on session with ID ${req.params.id}`)
			let tempJob: Job = JSON.parse(JSON.stringify(session.defaultMultipleJob));
			tempJob.pdu.source_addr = req.body.source;
			tempJob.pdu.destination_addr = req.body.destination;
			tempJob.pdu.short_message = req.body.message;
			tempJob.perSecond = 1 / (req.body.interval / 1000);
			tempJob.count = req.body.count;
			session.sendMultiple(tempJob)
				.then(pdu => res.send(pdu),
					err => res.status(400).send({
						err: true,
						message: err
					}));
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doCancelSendMany(req: any, res: any) {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			this.logger.log1(`Cancelling send timer for session with ID ${req.params.id}`);
			session.cancelSendInterval();
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doDisconnect(req: any, res: any) {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			this.logger.log1(`Disconnecting session with ID ${req.params.id}`)
			session.close().then(() => res.send(session.serialize()), err => res.status(400).send({
				err: true,
				message: err
			}));
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doDelete(req: any, res: any) {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			this.sessionManager.removeSession(session);
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	abstract doPost(req: any, res: any): void;

	abstract doConnect(req: any, res: any): void;

	abstract doBind(req: any, res: any): void;

	abstract doGetAvailableProcessors(req: any, res: any): void;

	abstract doGetAppliedProcessors(req: any, res: any): void;

	abstract doAddProcessor(req: any, res: any): void;

	abstract doRemoveProcessor(req: any, res: any): void;
	handleSessionNotFound(req: any, res: any): void {
		let error = `No session found with ID ${req.params.id}`;
		this.logger.log1(error);
		res.status(404).send({
			err: true,
			message: error
		});
	}
}