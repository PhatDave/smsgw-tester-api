import Center from "../Center/Center";
import CenterSessionManager from "../Center/CenterSessionManager";
import Logger from "../Logger";
import PduProcessor from "../PDUProcessor/PduProcessor";
import ProcessorManager from "../PDUProcessor/ProcessorManager";
import SessionManager from "../SessionManager";
import SmppSession from "../SmppSession";
import RequestHandler from "./RequestHandler";

export default class CenterRequestHandler extends RequestHandler {
    sessionManager: CenterSessionManager;
    logger: Logger = new Logger(this.constructor.name);

    constructor(sessionManager: SessionManager) {
        super();
        this.sessionManager = sessionManager as CenterSessionManager;
    }

    doGetAvailableProcessors(req: any, res: any): void {
        this.logger.log1("Getting available processors");
        let processors: PduProcessor[] = ProcessorManager.getProcessorsForType(Center.name);
        res.send(processors.map((processor: any) => processor.serialize()));
    }

    doGetAppliedProcessors(req: any, res: any): void {
        this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
            let processors: PduProcessor[] = session.appliedProcessors;
            res.send(processors.map((processor: any) => processor.serialize()));
        }, this.handleSessionNotFound.bind(this, req, res));
    }

    doAddProcessor(req: any, res: any): void {
        this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
            let processors: PduProcessor[] = ProcessorManager.getProcessors(req.body.name);
            ProcessorManager.attachProcessors(session, processors);
            res.send(session.serialize());
        }, this.handleSessionNotFound.bind(this, req, res));
    }

    doRemoveProcessor(req: any, res: any): void {
        this.sessionManager.getSession(req.params.id).then((session: SmppSession) => {
            let processors: PduProcessor[] = ProcessorManager.getProcessors(req.body.name);
            ProcessorManager.detachProcessors(session, processors);
            res.send(session.serialize());
        }, this.handleSessionNotFound.bind(this, req, res));
    }

    doPost(req: any, res: any): void {
        this.logger.log1("Creating center session");
        this.sessionManager.createSession(req.body.port, req.body.username, req.body.password).then((session: SmppSession) => {
            res.send(session.serialize());
        }, (err: any) => {
            this.logger.log1(`Failed to create center session: ${err}`);
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
