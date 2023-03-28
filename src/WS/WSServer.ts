import Logger from "../Logger";
import SessionManager from "../SessionManager";
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

	// constructor() {
	// 	// @ts-ignore
	// 	this.server = new WebSocket.Server({port: WS_SERVER_PORT});
	// 	this.logger = new Logger("WSServer");
	// 	this.server.on('connection', this.onConnection.bind(this));
	// 	this.logger.log1(`WSServer listening at ws://localhost:${WS_SERVER_PORT}`);
	// }

	// onConnection(ws: WebSocket) {
	// 	this.logger.log1("New connection");
	// 	this.unknownClients.push(ws);
	// 	ws.on('message', this.onMessage.bind(this, ws));
	// 	ws.on('close', this.onClose.bind(this, ws));
	// }
	//
	// addClient(ws, type, sessionId) {
	// 	if (!this.clients[type]) {
	// 		this.clients[type] = {};
	// 	}
	// 	if (!this.clients[type][sessionId]) {
	// 		this.clients[type][sessionId] = [];
	// 	}
	// 	this.logger.log1(`Adding client ${ws.id} to ${type} session ${sessionId}`);
	//
	// 	if (type === "client") {
	// 		if (this.listenersAlreadySetup.indexOf(`client-${sessionId}`) === -1) {
	// 			let session = clientSessionManager.getSession(sessionId);
	// 			if (!!session) {
	// 				this.logger.log1(`Setting up listeners for client session ${sessionId}`);
	// 				session.on(ClientSession.STATUS_CHANGED_EVENT, this.onClientSessionStatusChange.bind(this, sessionId));
	// 				session.on(ClientSession.ANY_PDU_EVENT, this.onClientSessionPdu.bind(this, sessionId));
	// 				session.on(ClientSession.MESSAGE_SEND_COUNTER_UPDATE_EVENT, this.onClientMessageCounterUpdate.bind(this, sessionId));
	// 			}
	// 			this.listenersAlreadySetup.push(`client-${sessionId}`);
	// 		} else {
	// 			this.logger.log1(`Listeners for client session ${sessionId} already set up`);
	// 		}
	// 	} else if (type === "center") {
	// 		if (this.listenersAlreadySetup.indexOf(`center-${sessionId}`) === -1) {
	// 			let session = centerSessionManager.getSession(sessionId);
	// 			if (!!session) {
	// 				this.logger.log1(`Setting up listeners for center session ${sessionId}`);
	// 				session.on(CenterSession.STATUS_CHANGED_EVENT, this.onCenterStatusChange.bind(this, sessionId));
	// 				session.on(CenterSession.ANY_PDU_EVENT, this.onCenterServerPdu.bind(this, sessionId));
	// 				session.on(CenterSession.MODE_CHANGED_EVENT, this.onCenterModeChanged.bind(this, sessionId));
	// 				session.on(CenterSession.SESSION_CHANGED_EVENT, this.onCenterSessionsChanged.bind(this, sessionId));
	// 				session.on(ClientSession.MESSAGE_SEND_COUNTER_UPDATE_EVENT, this.onCenterMessageCounterUpdate.bind(this, sessionId));
	// 			}
	// 			this.listenersAlreadySetup.push(`center-${sessionId}`);
	// 		} else {
	// 			this.logger.log1(`Listeners for center session ${sessionId} already set up`);
	// 		}
	// 	}
	//
	// 	this.clients[type][sessionId].push(ws);
	// 	this.logger.log1(`Now active ${this.clients[type][sessionId].length} clients in session ID: ${sessionId} of type ${type}`);
	// }
	//
	// onMessage(ws, message) {
	// 	this.logger.log1("New message");
	// 	message = String(message);
	// 	let data = message.split(":");
	// 	let type = data[0];
	// 	let sessionId = data[1];
	//
	// 	this.logger.log1(`Moving client to session ID: ${sessionId} of type ${type}`);
	// 	delete this.unknownClients[ws];
	// 	this.unknownClients = this.unknownClients.filter(Boolean);
	//
	// 	this.addClient(ws, type, sessionId);
	// 	this.logger.log1(`Now active ${this.clients[type][sessionId].length} clients in session ID: ${sessionId} of type ${type}`);
	// }
	//
	// onClose(ws) {
	// 	this.removeClient(ws);
	// 	// this.logger.log6(this.clients);
	// 	this.logger.log1("Connection closed");
	// }
	//
	// removeClient(ws) {
	// 	this.clients.client = this.removeFromArray(this.clients.client, ws);
	// 	this.clients.center = this.removeFromArray(this.clients.center, ws);
	// }
	//
	// removeFromArray(array, element) {
	// 	for (let sessionId in array) {
	// 		let index = array[sessionId].indexOf(element);
	// 		if (index > -1) {
	// 			delete array[sessionId][index];
	// 		}
	// 		array[sessionId] = array[sessionId].filter(Boolean);
	// 		if (array[sessionId].length === 0) {
	// 			delete array[sessionId];
	// 		}
	// 	}
	// 	return array;
	// }
	//
	// onClientSessionStatusChange(sessionId, newStatus) {
	// 	this.logger.log1(`Session with ID ${sessionId} changed`);
	// 	let payload = {
	// 		objectType: "client",
	// 		type: 'status',
	// 		sessionId: sessionId,
	// 		value: newStatus
	// 	}
	// 	let clients = this.clients["client"][sessionId];
	// 	if (!!clients) {
	// 		this.logger.log1(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
	// 		clients.forEach(client => {
	// 			client.send(JSON.stringify(payload));
	// 		});
	// 	}
	// }
	//
	// onClientSessionPdu(sessionId, pdu) {
	// 	// TODO: Maybe move this to an "ignored" array against who the pdu.command is compared
	// 	if (pdu.command === 'enquire_link_resp' || pdu.command === 'enquire_link') {
	// 		return;
	// 	}
	// 	let clients = this.clients["client"][sessionId];
	// 	if (!!clients) {
	// 		this.logger.log2(`Session with ID ${sessionId} fired PDU`);
	// 		let payload = {
	// 			objectType: "client",
	// 			type: 'pdu',
	// 			sessionId: sessionId,
	// 			value: pdu
	// 		}
	// 		this.logger.log2(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
	// 		clients.forEach(client => {
	// 			client.send(JSON.stringify(payload));
	// 		});
	// 	}
	// }
	//
	// onClientMessageCounterUpdate(sessionId, counter) {
	// 	this.logger.log2(`Session with ID ${sessionId} updating message send counter`);
	// 	let payload = {
	// 		objectType: "client",
	// 		type: 'counterUpdate',
	// 		sessionId: sessionId,
	// 		value: counter
	// 	}
	// 	let clients = this.clients["client"][sessionId];
	// 	if (!!clients) {
	// 		this.logger.log2(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
	// 		clients.forEach(client => {
	// 			client.send(JSON.stringify(payload));
	// 		});
	// 	}
	// }
	//
	// onCenterStatusChange(sessionId, newStatus) {
	// 	this.logger.log1(`Session with ID ${sessionId} changed`);
	// 	let payload = {
	// 		objectType: "center",
	// 		type: 'status',
	// 		sessionId: sessionId,
	// 		value: newStatus
	// 	}
	// 	let clients = this.clients["center"][sessionId];
	// 	if (!!clients) {
	// 		this.logger.log1(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
	// 		clients.forEach(client => {
	// 			client.send(JSON.stringify(payload));
	// 		});
	// 	}
	// }
	//
	// onCenterServerPdu(sessionId, pdu) {
	// 	if (pdu.command === 'enquire_link_resp' || pdu.command === 'enquire_link') {
	// 		return;
	// 	}
	// 	let clients = this.clients["center"][sessionId];
	// 	if (!!clients) {
	// 		this.logger.log2(`Session with ID ${sessionId} fired PDU`);
	// 		let payload = {
	// 			objectType: "center",
	// 			type: 'pdu',
	// 			sessionId: sessionId,
	// 			value: pdu
	// 		}
	// 		this.logger.log2(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
	// 		clients.forEach(client => {
	// 			client.send(JSON.stringify(payload));
	// 		});
	// 	}
	// }
	//
	// onCenterModeChanged(sessionId, newMode) {
	// 	this.logger.log1(`Session with ID ${sessionId} changed`);
	// 	let payload = {
	// 		objectType: "center",
	// 		type: 'mode',
	// 		sessionId: sessionId,
	// 		value: newMode,
	// 		text: CenterMode[newMode]
	// 	}
	// 	let clients = this.clients["center"][sessionId];
	// 	if (!!clients) {
	// 		this.logger.log1(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
	// 		clients.forEach(client => {
	// 			client.send(JSON.stringify(payload));
	// 		});
	// 	}
	// }
	//
	// onCenterSessionsChanged(sessionId, newSession) {
	// 	this.logger.log1(`Session with ID ${sessionId} changed`);
	// 	let payload = {
	// 		objectType: "center",
	// 		type: 'sessions',
	// 		sessionId: sessionId,
	// 		value: newSession
	// 	}
	// 	let clients = this.clients["center"][sessionId];
	// 	if (!!clients) {
	// 		this.logger.log1(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
	// 		clients.forEach(client => {
	// 			client.send(JSON.stringify(payload));
	// 		});
	// 	}
	// }
	//
	// onCenterMessageCounterUpdate(sessionId, counter) {
	// 	this.logger.log2(`Session with ID ${sessionId} updating message send counter`);
	// 	let payload = {
	// 		objectType: "center",
	// 		type: 'counterUpdate',
	// 		sessionId: sessionId,
	// 		value: counter
	// 	}
	// 	let clients = this.clients["center"][sessionId];
	// 	if (!!clients) {
	// 		this.logger.log2(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
	// 		clients.forEach(client => {
	// 			client.send(JSON.stringify(payload));
	// 		});
	// 	}
	// }
}