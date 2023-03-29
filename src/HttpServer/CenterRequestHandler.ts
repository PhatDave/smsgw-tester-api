import {Center} from "../Center/Center";
import {CenterSessionManager} from "../Center/CenterSessionManager";
import Logger from "../Logger";
import {PduProcessor} from "../PDUProcessor/PduProcessor";
import {SessionManager} from "../SessionManager";
import {SmppSession} from "../SmppSession";
import {RequestHandler} from "./RequestHandler";

export class CenterRequestHandler extends RequestHandler {
	sessionManager: CenterSessionManager;
	logger: Logger = new Logger(this.constructor.name);

	constructor(sessionManager: SessionManager) {
		super();
		this.sessionManager = sessionManager as CenterSessionManager;
	}

	doGetAvailableProcessors(req: any, res: any): void {
		this.logger.log1("Getting available processors");
		let processors: PduProcessor[] = PduProcessor.getProcessorsForType(Center.name);
		res.send(processors.map((processor: any) => processor.serialize()));
	}

	doGetAppliedProcessors(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			let processors: PduProcessor[] = session.pduProcessors;
			res.send(processors.map((processor: any) => processor.serialize()));
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doAddProcessor(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			let processor = PduProcessor.getProcessor(req.body.name);
			PduProcessor.attachProcessor(session, processor);
			res.send(session.serialize());
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doRemoveProcessor(req: any, res: any): void {
		this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
			let processor = PduProcessor.getProcessor(req.body.name);
			PduProcessor.detachProcessor(session, processor);
			res.send(session.serialize());
		}, this.handleSessionNotFound.bind(this, req, res));
	}

	doPost(req: any, res: any): void {
		this.logger.log1("Creating client session");
		this.sessionManager.createSession(req.body.port, req.body.username, req.body.password).then((session: SmppSession) => {
			res.send(session.serialize());
		}, (err: any) => {
			this.logger.log1(`Failed to create client session: ${err}`);
			res.status(500).send();
		});
	}

	doConnect(req: any, res: any): void {
		throw new Error("Method not implemented.");
	}

	doBind(req: any, res: any): void {
		throw new Error("Method not implemented.");
	}
}