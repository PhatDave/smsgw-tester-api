const smpp = require("smpp");
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const NanoTimer = require('nanotimer');

const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const WebSocket = require("ws");

const SERVER_PORT = process.env.SERVER_PORT || 8190;
const WS_SERVER_PORT = process.env.WS_SERVER_PORT || 8191;
const SESSIONS_FILE = process.env.SESSIONS_FILE || "sessions.json";
const MESSAGE_SEND_UPDATE_DELAY = process.env.MESSAGE_SEND_UPDATE_DELAY || 500;


[
	'debug',
	'log',
	'warn',
	'error'
].forEach((methodName) => {
	const originalLoggingMethod = console[methodName];
	console[methodName] = (firstArgument, ...otherArguments) => {
		const originalPrepareStackTrace = Error.prepareStackTrace;
		Error.prepareStackTrace = (_, stack) => stack;
		const callee = new Error().stack[2];
		Error.prepareStackTrace = originalPrepareStackTrace;
		const relativeFileName = path.relative(process.cwd(), callee.getFileName());
		const prefix = `${relativeFileName}:${callee.getLineNumber()}:`;
		if (typeof firstArgument === 'string') {
			originalLoggingMethod(prefix + ' ' + firstArgument, ...otherArguments);
		} else {
			originalLoggingMethod(prefix, firstArgument, ...otherArguments);
		}
	};
});

class Logger {
	constructor(clazz) {
		this.clazz = clazz;
		this.logLevel = typeof LOG_LEVEL !== "undefined" ? LOG_LEVEL : 6;
		this.logFile = typeof LOG_FILE !== "undefined" ? LOG_FILE : null;

		this.logFileWriteStream = null;
		if (this.logFile != null) {
			this.logFileWriteStream = fs.createWriteStream(this.logFile, {flags: 'a'});
		}
	}

	leftPad(str, len, char) {
		str = String(str);
		let i = -1;
		len = len - str.length;
		if (char === undefined) {
			char = " ";
		}
		while (++i < len) {
			str = char + str;
		}
		return str;
	}

	log(...args) {
		let logLevel = args[0];
		let data = args[1];
		if (typeof data === "object") {
			data = JSON.stringify(data);
		}
		let date = new Date();

		let year = this.leftPad(date.getFullYear(), 4);
		let month = this.leftPad(date.getMonth() + 1, 2, 0);
		let day = this.leftPad(date.getDate(), 2, 0);

		let hours = this.leftPad(date.getHours(), 2, 0);
		let minutes = this.leftPad(date.getMinutes(), 2, 0);
		let seconds = this.leftPad(date.getSeconds(), 2, 0);
		let milliseconds = this.leftPad(date.getMilliseconds(), 3, 0);

		let datePrefix = `[${day}/${month}/${year}-${hours}:${minutes}:${seconds}:${milliseconds}]`

		// let out = `${datePrefix} [${this.clazz}] (${logLevel}) ${data}`;
		let out = datePrefix.padEnd(30, ' ') + `[${this.clazz}]`.padEnd(28, ' ') + `(${logLevel})`.padEnd(8, ' ') + data;
		if (args[0] <= this.logLevel || 6) {
			console.log(out);
		}
		if (this.logFileWriteStream != null) {
			this.logFileWriteStream.write(out + "\n");
		}
	}

	log1 = this.log.bind(this, 1);
	log2 = this.log.bind(this, 2);
	log3 = this.log.bind(this, 3);
	log4 = this.log.bind(this, 4);
	log5 = this.log.bind(this, 5);
	log6 = this.log.bind(this, 6);
}

let logger = new Logger("main");

class ClientSessionStatus {
	static OK = "OK";
	static CONNECTING = "CONNECTING";
	static CONNECTED = "CONNECTED";
	static BINDING = "BINDING";
	static BOUND = "BOUND";
	static READY = "READY";
	static CONNECT_FAILED = "CONNECT_FAILED";
	static BIND_FAILED = "BIND_FAILED";
	static NOT_CONNECTED = "NOT_CONNECTED";
}

class ClientSession {
	auto_enquire_link_period = 500;
	eventEmitter = new EventEmitter();
	busy = false;

	connectingPromise = {
		promise: null,
		resolve: null,
		reject: null
	}
	disconnectingPromise = {
		promise: null,
		resolve: null,
		reject: null
	}
	bindingPromise = {
		promise: null,
		resolve: null,
		reject: null
	}

	static STATUS_CHANGED_EVENT = "statusChanged";
	static ANY_PDU_EVENT = "*";
	static MESSAGE_SEND_COUNTER_UPDATE_EVENT = "messageSendCounterUpdate";

	constructor(id, url, username, password) {
		this.id = id;
		this.logger = new Logger(`Session-${this.id}`);
		this.url = url;

		this.username = username;
		this.password = password;

		this.logger.log1(`Session created with url ${this.url}, username ${this.username}, password ${this.password} and ID ${this.id}`);
		this.status = ClientSessionStatus.NOT_CONNECTED;
	}

	setStatus(newStatus) {
		this.status = newStatus;
		this.eventEmitter.emit(ClientSession.STATUS_CHANGED_EVENT, newStatus);
	}

	connect() {
		this.connectingPromise.promise = new Promise((resolve, reject) => {
			if (this.status !== ClientSessionStatus.NOT_CONNECTED) {
				this.logger.log1("ClientSession already connected");
				reject("ClientSession already connected");
				return;
			}
			this.logger.log1("Connecting to " + this.url);
			this.setStatus(ClientSessionStatus.CONNECTING);
			try {
				this.session = smpp.connect({
					                            url: this.url,
					                            auto_enquire_link_period: this.auto_enquire_link_period,
				                            }, this.connected.bind(this));
				this.session.on('error', this.clientError.bind(this));
			} catch (e) {
				this.logger.log1("Connection failed to " + this.url);
				this.setStatus(ClientSessionStatus.CONNECT_FAILED);
				reject("Connection failed to " + this.url);
			}
			this.connectingPromise.resolve = resolve;
			this.connectingPromise.reject = reject;
		});
		return this.connectingPromise.promise;
	}

	clientError(error) {
		if (error.code === "ETIMEOUT") {
			this.logger.log1("Connection timed out to " + this.url);
		} else if (error.code === "ECONNREFUSED") {
			this.logger.log1("Connection refused to " + this.url);
		} else {
			this.logger.log1("Connection failed to " + this.url);
		}
	}

	connected() {
		this.logger.log1("Connected to " + this.url);
		this.setStatus(ClientSessionStatus.CONNECTED);
		this.session.on('debug', (type, msg, payload) => {
			if (type.includes('pdu.')) {
				this.eventEmitter.emit(msg, payload);
				this.eventEmitter.emit(ClientSession.ANY_PDU_EVENT, payload);
			}
		})
		this.connectingPromise.resolve();
	}

	bind() {
		this.bindingPromise.promise = new Promise((resolve, reject) => {
			if (this.status !== ClientSessionStatus.CONNECTED) {
				this.logger.log1(`Cannot bind, not connected to ${this.url}`);
				reject(`Cannot bind, not connected to ${this.url}`);
				return;
			}

			this.logger.log1("Trying to bind to " + this.url)
			if (this.status !== ClientSessionStatus.CONNECTED) {
				this.logger.log1(`Cannot bind, not connected to ${this.url}`);
				return;
			}
			if (!!!this.username || !!!this.password) {
				this.logger.log1(`Cannot bind, username or password not set`);
				return;
			}
			this.setStatus(ClientSessionStatus.BINDING);
			this.logger.log1(`Binding to ${this.url} with username ${this.username} and password ${this.password}`);

			this.session.bind_transceiver({
				                              system_id: this.username,
				                              password: this.password,
			                              }, this.bindReply.bind(this));
			this.bindingPromise.resolve = resolve;
			this.bindingPromise.reject = reject;
		});
		return this.bindingPromise.promise;
	}

	bindReply(pdu) {
		if (pdu.command_status === 0) {
			this.logger.log1(`Bound to ${this.url} with username ${this.username} and password ${this.password}`);
			this.setStatus(ClientSessionStatus.BOUND);
			this.bindingPromise.resolve();
		} else {
			this.logger.log1(`Bind failed to ${this.url} with username ${this.username} and password ${this.password}`);
			this.setStatus(ClientSessionStatus.BIND_FAILED);
			this.bindingPromise.reject();
		}
	}

	send(source, destination, message) {
		return new Promise((resolve, reject) => {
			if (!this.canSend()) {
				this.logger.log1(`Cannot send message, not bound to ${this.url} or busy`);
				reject(`Cannot send message, not bound to ${this.url} or busy`);
				return;
			}
			this.logger.log1(`Sending message from ${source} to ${destination} with message ${message}`);
			this.session.submit_sm({
				                       source_addr: source,
				                       destination_addr: destination,
				                       short_message: message
			                       }, pdu => {
				resolve(pdu);
			});
		});
	}

	sendOnInterval(source, destination, message, interval, count) {
		return new Promise((resolve, reject) => {
			if (!this.canSend() || this.busy) {
				this.logger.log1(`Cannot send many message, not bound to ${this.url} or busy`);
				reject(`Cannot send many message, not bound to ${this.url} or busy`);
				return;
			}
			this.busy = true;
			this.timer = new NanoTimer();
			let counter = 0;
			let previousUpdateCounter = 0;

			this.updateTimer = new NanoTimer();
			this.updateTimer.setInterval(() => {
				if (previousUpdateCounter !== counter) {
					this.eventEmitter.emit(ClientSession.MESSAGE_SEND_COUNTER_UPDATE_EVENT, counter);
					previousUpdateCounter = counter;
				}
			}, '', `${MESSAGE_SEND_UPDATE_DELAY / 1000} s`);

			this.timer.setInterval(() => {
				if (count > 0 && counter >= count) {
					this.cancelSendInterval();
				} else {
					this.send(source, destination, message)
						.catch(e => this.logger.log1(`Error sending message: ${e}`));
					counter++;
				}
			}, '', `${interval} s`);
			resolve();
		});
	}

	cancelSendInterval() {
		if (!!this.timer) {
			this.timer.clearInterval();
			this.updateTimer.clearInterval();
			this.timer = null;
			this.updateTimer = null;
		}
		this.busy = false;
	}

	close() {
		this.disconnectingPromise.promise = new Promise((resolve, reject) => {
			if (this.status !== ClientSessionStatus.BOUND && this.status !== ClientSessionStatus.CONNECTED) {
				this.logger.log1(`Cannot close session, not bound to ${this.url}`);
				reject(`Cannot close session, not bound to ${this.url}`);
				return;
			}
			this.session.close();
			this.setStatus(ClientSessionStatus.NOT_CONNECTED);
			resolve();
		});
		return this.disconnectingPromise.promise;
	}

	on(event, callback) {
		this.eventEmitter.on(event, callback);
	}

	serialize() {
		return {
			id: this.id,
			url: this.url,
			username: this.username,
			password: this.password,
			status: this.status
		}
	}

	canSend() {
		return this.status === ClientSessionStatus.BOUND;
	}
}

class ClientSessionManager {
	sessionIdCounter = 0;
	logger = new Logger("ClientSessionManager");

	constructor() {
		this.sessions = {};
		// process.on('exit', this.cleanup.bind(this));
		// process.on('SIGINT', this.cleanup.bind(this));
		// process.on('SIGUSR1', this.cleanup.bind(this));
		// process.on('SIGUSR2', this.cleanup.bind(this));
		// process.on('uncaughtException', this.cleanup.bind(this));
	}

	createSession(url, username, password) {
		let urlB64 = btoa(url);
		if (this.sessions[urlB64]) {
			this.logger.log1(`Session to ${url} already exists`);
			return this.sessions[urlB64];
		}
		this.logger.log1(`Creating session to ${url} with username ${username} and password ${password}`);
		let session = new ClientSession(this.sessionIdCounter++, url, username, password);
		this.addSession(session);
		return session;
	}

	addSession(session) {
		this.logger.log1(`Adding session with ID ${session.id}`);
		this.sessions[btoa(session.url)] = session;
	}

	deleteSession(session) {
		this.logger.log1(`Deleting session with ID ${session.id}`);
		if (session.status === ClientSessionStatus.BOUND || session.status === ClientSessionStatus.CONNECTED) {
			session.close();
		}
		delete this.sessions[btoa(session.url)];
	}

	getSession(id) {
		return Object.values(this.sessions).find((session) => {
			return session.id == id;
		});
	}

	serialize() {
		return Object.values(this.sessions).map((session) => {
			return session.serialize();
		});
	}

	cleanup() {
		this.logger.log1(`Saving sessions to ${SESSIONS_FILE}...`);
		fs.writeFileSync(SESSIONS_FILE, JSON.stringify(this.serialize(), null, 4));
		process.exit(0);
	}

	startup() {
		let sessions = fs.readFileSync(SESSIONS_FILE);
		sessions = JSON.parse(sessions);
		this.logger.log1(`Loaded ${sessions.length} sessions from ${SESSIONS_FILE}...`);
		sessions.forEach(session => {
			this.createSession(session.url, session.username, session.password);
		})
	}
}

class HTTPServer {
	logger = new Logger("HTTPServer");

	constructor() {
		app.use(bodyParser.json());

		app.get('/api/client', this.getClientSessions.bind(this));
		app.post('/api/client', this.createClientSession.bind(this));
		app.get('/api/client/:id', this.getClientSessionById.bind(this));
		app.post('/api/client/:id/send', this.send.bind(this));
		app.post('/api/client/:id/sendMany', this.sendMany.bind(this));
		app.delete('/api/client/:id/sendMany', this.cancelSendMany.bind(this));
		app.post('/api/client/:id/bind', this.bindClientSession.bind(this));
		app.post('/api/client/:id/connect', this.connectClientSession.bind(this));
		app.delete('/api/client/:id/connect', this.disconnectClientSession.bind(this));
		app.delete('/api/client/:id', this.deleteClientSession.bind(this));

		this.server = app.listen(SERVER_PORT, function() {
			this.logger.log1(`HTTPServer listening at http://localhost:${SERVER_PORT}`)
		}.bind(this));
	}

	// TODO: These requests deserve error handling

	getClientSessions(req, res) {
		this.logger.log1("Getting sessions");
		res.send(JSON.stringify(clientSessionManager.serialize()));
	}

	createClientSession(req, res) {
		this.logger.log1("Creating session");
		let session = clientSessionManager.createSession(req.body.url, req.body.username, req.body.password);
		res.send(JSON.stringify(session.serialize()));
	}

	getClientSessionById(req, res) {
		let session = clientSessionManager.getSession(req.params.id);
		this.logger.log1(`Getting session by ID ${req.params.id}`);
		if (session) {
			this.logger.log1(`Session found with ID ${req.params.id}`)
			res.send(JSON.stringify(session.serialize()));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	send(req, res) {
		let session = clientSessionManager.getSession(req.params.id);
		let source = req.body.source;
		let destination = req.body.destination;
		let message = req.body.message;
		this.logger.log1(`Sending message from ${source} to ${destination} with message ${message} on session with ID ${req.params.id}`)
		if (session) {
			session.send(source, destination, message)
				.then(pdu => res.send(JSON.stringify(pdu)))
				.catch(err => res.status(400).send(JSON.stringify(err)));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	sendMany(req, res) {
		let session = clientSessionManager.getSession(req.params.id);
		let source = req.body.source;
		let destination = req.body.destination;
		let message = req.body.message;
		let interval = req.body.interval / 1000;
		let count = req.body.count;
		if (!!req.body.perSecond) {
			interval = 1 / req.body.perSecond;
		}
		let perSecond = 1 / interval;
		this.logger.log1(
			`Sending ${count} messages from ${source} to ${destination} with message ${message} on session with ID ${req.params.id} at a rate of ${perSecond} per second.`);
		if (session) {
			session.sendOnInterval(source, destination, message, interval, count)
				.then(pdu => res.send(JSON.stringify(pdu)))
				.catch(err => res.status(400).send(JSON.stringify(err)));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	cancelSendMany(req, res) {
		let session = clientSessionManager.getSession(req.params.id);
		if (!session.busy) {
			res.status(400).send({
				                     err: true,
				                     msg: `Session with ID ${req.params.id} is not sending messages`
			                     });
			return;
		}
		this.logger.log1(`Cancelling send timer for session with ID ${req.params.id}`);
		if (session) {
			session.cancelSendInterval();
			res.send();
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	bindClientSession(req, res) {
		this.logger.log1(`Binding session with ID ${req.params.id}`)
		// Maybe make this async?
		let session = clientSessionManager.getSession(req.params.id);
		if (session) {
			session.bind()
				.then(() => res.send(JSON.stringify(session.serialize())))
				.catch(err => res.status(400).send({
					                                   err: true,
					                                   msg: err
				                                   }));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	connectClientSession(req, res) {
		this.logger.log1(`Connecting session with ID ${req.params.id}`)
		let session = clientSessionManager.getSession(req.params.id);
		if (session) {
			session.connect()
				.then(() => res.send(JSON.stringify(session.serialize())))
				.catch(err => res.status(400).send({
					                                   err: true,
					                                   msg: err
				                                   }));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	disconnectClientSession(req, res) {
		this.logger.log1(`Disconnecting session with ID ${req.params.id}`)
		let session = clientSessionManager.getSession(req.params.id);
		if (session) {
			session.close()
				.then(() => res.send(JSON.stringify(session.serialize())))
				.catch(err => res.status(400).send({
					                                   err: true,
					                                   msg: err
				                                   }));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	deleteClientSession(req, res) {
		this.logger.log1(`Deleting session with ID ${req.params.id}`);
		let session = clientSessionManager.getSession(req.params.id);
		if (session) {
			clientSessionManager.deleteSession(session);
			res.send();
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}
}

class WSServer {
	clients = {};

	constructor() {
		this.server = new WebSocket.Server({port: WS_SERVER_PORT});
		this.logger = new Logger("WSServer");
		this.server.on('connection', this.onConnection.bind(this));
		this.logger.log1(`WSServer listening at ws://localhost:${WS_SERVER_PORT}`);
	}

	onConnection(ws) {
		this.logger.log1("New connection");
		this.addClient(ws, -1);
		ws.on('message', this.onMessage.bind(this, ws));
		ws.on('close', this.onClose.bind(this, ws));
	}

	addClient(ws, sessionId) {
		if (!this.clients[sessionId]) {
			this.clients[sessionId] = [];
			let session = clientSessionManager.getSession(sessionId);
			if (session) {
				// session.on(ClientSession.STATUS_CHANGED_EVENT, this.onSessionChange.bind(this, sessionId));
				// session.on(ClientSession.ANY_PDU_EVENT, this.pduEvent.bind(this, sessionId));
				session.on(ClientSession.MESSAGE_SEND_COUNTER_UPDATE_EVENT, this.onMessageSendCounterUpdate.bind(this, sessionId));
			}
		}
		this.logger.log1(`Added client to session ID: ${sessionId}`);
		this.clients[sessionId].push(ws);
		this.logger.log1(`Now active ${this.clients[sessionId].length} clients in session ID: ${sessionId}`);
	}

	onMessage(ws, message) {
		this.logger.log1("New message");
		let sessionId = String(message);
		this.logger.log1(`Moving client to session ID: ${sessionId}`);
		this.removeClient(ws);
		this.addClient(ws, sessionId);
		this.logger.log1(`Now active ${this.clients[sessionId].length} clients in session ID: ${sessionId}`);
	}

	onClose(ws) {
		this.removeClient(ws);
		this.logger.log6(this.clients);
		this.logger.log1("Connection closed");
	}

	removeClient(ws) {
		for (let sessionId in this.clients) {
			let index = this.clients[sessionId].indexOf(ws);
			if (index > -1) {
				delete this.clients[sessionId][index];
			}
			this.clients[sessionId] = this.clients[sessionId].filter(Boolean);
		}
	}

	onSessionChange(sessionId, newStatus) {
		this.logger.log1(`Session with ID ${sessionId} changed`);
		let payload = {
			type: 'status',
			sessionId: sessionId,
			value: newStatus
		}
		let clients = this.clients[sessionId];
		if (!!clients) {
			this.logger.log1(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
			clients.forEach(client => {
				client.send(JSON.stringify(payload));
			});
		}
	}

	pduEvent(sessionId, pdu) {
		this.logger.log2(`Session with ID ${sessionId} fired PDU`);
		let payload = {
			type: 'pdu',
			sessionId: sessionId,
			value: pdu
		}
		let clients = this.clients[sessionId];
		if (!!clients) {
			this.logger.log2(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
			clients.forEach(client => {
				client.send(JSON.stringify(payload));
			});
		}
	}

	onMessageSendCounterUpdate(sessionId, counter) {
		this.logger.log2(`Session with ID ${sessionId} updating message send counter`);
		let payload = {
			type: 'counterUpdate',
			sessionId: sessionId,
			value: counter
		}
		let clients = this.clients[sessionId];
		if (!!clients) {
			this.logger.log2(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
			clients.forEach(client => {
				client.send(JSON.stringify(payload));
			});
		}
	}
}

let clientSessionManager = new ClientSessionManager();
clientSessionManager.startup();
let session = clientSessionManager.getSession(0);
session.connect().then(() => session.bind());
new WSServer();
new HTTPServer();