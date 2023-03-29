import {Client} from "../Client/Client";
import ClientSessionManager from "../Client/ClientSessionManager";
import Logger from "../Logger";
import {SessionManager} from "../SessionManager";
import {SmppSession} from "../SmppSession";
import {RequestHandler} from "./RequestHandler";

export default class ClientRequestHandler extends RequestHandler {
	sessionManager: ClientSessionManager;
	logger: Logger = new Logger(this.constructor.name);

	constructor(sessionManager: SessionManager) {
		super();
		this.sessionManager = sessionManager as ClientSessionManager;
	}

	doGetAvailableProcessors(req: any, res: any): void {
		throw new Error("Method not implemented.");
	}

	doGetAppliedProcessors(req: any, res: any): void {
		throw new Error("Method not implemented.");
	}

	doAddProcessor(req: any, res: any): void {
		throw new Error("Method not implemented.");
	}

	doRemoveProcessor(req: any, res: any): void {
		throw new Error("Method not implemented.");
	}

	doPost(req: any, res: any): void {
		this.logger.log1("Creating client session");
		this.sessionManager.createSession(req.body.url, req.body.username, req.body.password).then((session: SmppSession) => {
			res.send(session.serialize());
		}, (err: any) => {
			this.logger.log1(`Failed to create client session: ${err}`);
			res.status(500).send();
		});
	}

	doBind(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			this.logger.log1(`Binding client session with ID ${req.params.id}`)
			let client = session as Client;
			client.doBind()
				.then(() => res.send(session.serialize()))
				.catch(err => res.status(400).send({
					err: true,
					msg: err
				}));
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doConnect(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			this.logger.log1(`Connecting client session with ID ${req.params.id}`)
			let client = session as Client;
			client.doConnect()
				.then(() => res.send(session.serialize()))
				.catch(err => res.status(400).send({
					err: true,
					msg: err
				}));
		}, this.handleSessionNotFound.bind(this, req, res));
	}
}