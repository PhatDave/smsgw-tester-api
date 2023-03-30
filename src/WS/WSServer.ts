import Logger from "../Logger";
import {SessionManager} from "../SessionManager";
import {ClientSet} from "./ClientSet";

const WebSocket = require("ws");

const WS_SERVER_PORT: number = Number(process.env.WS_SERVER_PORT) || 8191;

export class WSServer {
	private readonly clients: ClientSet[];
	private readonly unknownClients: any[];
	private readonly server: any;
	private readonly logger: Logger;
	private readonly sessionManagers: SessionManager[];

	constructor(sessionManagers: SessionManager[]) {
		this.clients = [];
		this.unknownClients = [];
		this.server = new WebSocket.Server({port: WS_SERVER_PORT});
		this.sessionManagers = sessionManagers;
		this.logger = new Logger("WSServer");
		this.server.on('connection', this.eventOnConnection.bind(this));
		this.logger.log1(`WSServer listening atws://localhost:${WS_SERVER_PORT}`);
	}

	private eventOnConnection(ws: WebSocket): void {
		this.logger.log1("New connection");
		this.unknownClients.push(ws);
		// @ts-ignore
		ws.on('message', this.eventOnMessage.bind(this, ws));
		// @ts-ignore
		ws.on('close', this.eventOnClose.bind(this, ws));
	}

	private eventOnMessage(ws: any, message: string): void {
		this.logger.log1("New message");
		message = String(message);
		this.unknownClients.splice(this.unknownClients.indexOf(ws), 1);
		let clientSet: ClientSet | undefined = this.clients.find((clientSet: ClientSet) => clientSet.identifier === message);
		if (!clientSet) {
			clientSet = new ClientSet(message, this.sessionManagers);
		}
		clientSet.add(ws);
	}

	private eventOnClose(ws: any): void {
		this.logger.log1("Connection closed");
		this.unknownClients.splice(this.unknownClients.indexOf(ws), 1);
	}
}