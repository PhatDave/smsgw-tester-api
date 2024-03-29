import {WSMessage} from "../CommonObjects";
import Logger from "../Logger";
import SessionManager from "../SessionManager";
import SmppSession from "../SmppSession";
import ZlibCoder from "../ZlibCoder";

export default class ClientSet {
    identifier: string;
    private clients: any[];
    private readonly type: string;
    private readonly sessionId: number;
    private readonly logger: Logger;
    private readonly relevantSessionManager: SessionManager | undefined;

    constructor(identifier: string, sessionManagers: SessionManager[]) {
        this.clients = [];
        this.identifier = identifier;

        let data: string[] = identifier.split(':');
        this.type = data[0];
        this.sessionId = parseInt(data[1]);

        this.logger = new Logger(`ClientSet-${this.type}-${this.sessionId}`);
        this.logger.log1(`Created client set for ${this.type} ${this.sessionId}`);

        this.relevantSessionManager = sessionManagers.find(sm => sm.identifier === this.type);
        if (!this.relevantSessionManager) {
            this.logger.log1(`No session manager found for type ${this.type}`);
            return;
        }
        if (this.relevantSessionManager) {
            this.relevantSessionManager.getSessions().then((sessions) => {
                sessions.forEach((session) => {
                    this.attachListener(session);
                });
            });
        }
        this.relevantSessionManager.on(this.relevantSessionManager.SESSION_ADDED_EVENT, this.eventOnSessionAdded.bind(this));
    }

    eventOnSessionAdded(sessionId: number): void {
        this.logger.log2(`Session added: ${sessionId}`);
        this.relevantSessionManager?.getSession(sessionId).then((session) => {
            this.attachListener(session);
        })
    }

    add(ws: any): void {
        this.logger.log2(`Added client`);
        this.clients.push(ws);
        ws.on('close', this.eventOnClose.bind(this, ws));
    }

    eventOnClose(ws: any): void {
        this.logger.log2(`Removed client`);
        this.clients.splice(this.clients.indexOf(ws), 1);
    }

    notifyClients(message: WSMessage) {
        if (message.identifier !== this.identifier) return;
        let textMessage: string = JSON.stringify(message);
        let compressedMessage = ZlibCoder.compress(textMessage);
        if (this.clients.length > 0) {
            this.logger.log2(`Notifying clients: ${message}`);
            this.clients.forEach((ws) => {
                ws.send(compressedMessage);
            });
        }
    }

    private attachListener(session: SmppSession) {
        session.on(session.UPDATE_WS, (message: WSMessage) => this.notifyClients(message));
    }
}
