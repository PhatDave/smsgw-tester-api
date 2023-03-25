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
const CLIENT_SESSIONS_FILE = process.env.CLIENT_SESSIONS_FILE || "client_sessions.json";
const CENTER_SESSIONS_FILE = process.env.CENTER_SESSIONS_FILE || "center_sessions.json";
const MESSAGE_SEND_UPDATE_DELAY = process.env.MESSAGE_SEND_UPDATE_DELAY || 500;

// TODO: Implement methods on both clients and servers that allows for modification of usernames and passwords
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
	static CONNECTING = "CONNECTING";
	static CONNECTED = "CONNECTED";
	static BINDING = "BINDING";
	static BOUND = "BOUND";
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
		this.logger = new Logger(`ClientSession-${this.id}`);
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
				this.session.on('error', this.error.bind(this));
			} catch (e) {
				this.logger.log1("Connection failed to " + this.url);
				this.setStatus(ClientSessionStatus.NOT_CONNECTED);
				this.session.close();
				reject("Connection failed to " + this.url);
			}
			this.connectingPromise.resolve = resolve;
			this.connectingPromise.reject = reject;
		});
		return this.connectingPromise.promise;
	}

	error(error) {
		if (error.code === "ETIMEOUT") {
			this.logger.log1("Connection timed out to " + this.url);
		} else if (error.code === "ECONNREFUSED") {
			this.logger.log1("Connection refused to " + this.url);
		} else {
			this.logger.log1("Connection failed to " + this.url);
		}
		this.session.close();
		this.setStatus(ClientSessionStatus.NOT_CONNECTED);
	}

	connected() {
		this.logger.log1("Connected to " + this.url);
		this.setStatus(ClientSessionStatus.CONNECTED);
		this.session.on('debug', (type, msg, payload) => {
			if (type.includes('pdu.')) {
				this.eventEmitter.emit(msg, payload);
				this.eventEmitter.emit(ClientSession.ANY_PDU_EVENT, payload);
			}
		});
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
			this.setStatus(ClientSessionStatus.CONNECTED);
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
		process.on('exit', this.cleanup.bind(this));
		process.on('SIGINT', this.cleanup.bind(this));
		process.on('SIGUSR1', this.cleanup.bind(this));
		process.on('SIGUSR2', this.cleanup.bind(this));
		process.on('uncaughtException', this.cleanup.bind(this));
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
		this.logger.log1(`Saving sessions to ${CLIENT_SESSIONS_FILE}...`);
		fs.writeFileSync(CLIENT_SESSIONS_FILE, JSON.stringify(this.serialize(), null, 4));
		process.exit(0);
	}

	startup() {
		try {
			let sessions = fs.readFileSync(CLIENT_SESSIONS_FILE);
			sessions = JSON.parse(sessions);
			this.logger.log1(`Loaded ${sessions.length} sessions from ${CLIENT_SESSIONS_FILE}...`);
			sessions.forEach(session => {
				this.createSession(session.url, session.username, session.password);
			});
		} catch (e) {
			this.logger.log1(`Error loading sessions from ${CLIENT_SESSIONS_FILE}: ${e}`);
		}
	}
}

class CenterSessionStatus {
	static CONNECTED = "CONNECTED";
	static WAITING_CONNECTION = "WAITING_CONNECTION";
	static CONNECTION_PENDING = "CONNECTION_PENDING";
}

class CenterSession {
	// TODO: Currently this center behaves as a DEBUG server, Implement ECHO and DR functionality
	// TODO: Mgw expects a reply to pdus... implement that
	// TODO: Currently notify does not work at all, figure out why...
	// TODO: If the port is in use this throws an exception, catch it and log it
	eventEmitter = new EventEmitter();
	busy = false;
	sessions = [];
	nextSession = 0;

	disconnectingPromise = {
		promise: null,
		resolve: null,
		reject: null
	}

	static STATUS_CHANGED_EVENT = "statusChanged";
	static ANY_PDU_EVENT = "*";
	static MESSAGE_SEND_COUNTER_UPDATE_EVENT = "messageSendCounterUpdate";

	constructor(id, port, username, password) {
		this.id = id;
		this.logger = new Logger(`CenterSession-${this.id}`);
		this.port = port;

		this.username = username;
		this.password = password;

		this.server = smpp.createServer({}, this.connected.bind(this));
		this.server.on('debug', (type, msg, payload) => {
			if (type.includes('pdu.')) {
				this.eventEmitter.emit(msg, payload);
				this.eventEmitter.emit(CenterSession.ANY_PDU_EVENT, payload);
			}
		});
		this.server.listen(this.port);

		this.logger.log1(`Session created with port ${this.port}, username ${this.username}, password ${this.password} and ID ${this.id}`);
		this.status = CenterSessionStatus.WAITING_CONNECTION;
	}

	setStatus(newStatus) {
		this.status = newStatus;
		this.eventEmitter.emit(CenterSession.STATUS_CHANGED_EVENT, newStatus);
	}

	error(error) {
		if (error.code === "ETIMEOUT") {
			this.logger.log1("Connection timed out to " + this.port);
		} else if (error.code === "ECONNREFUSED") {
			this.logger.log1("Connection refused to " + this.port);
		} else {
			this.logger.log1("Connection failed to " + this.port);
		}
		this.setStatus(CenterSessionStatus.CONNECTION_PENDING);
	}

	connected(session) {
		this.logger.log1("Center got a connection on port " + this.port);
		this.setStatus(CenterSessionStatus.CONNECTION_PENDING);

		session.on('error', this.error.bind(this));

		function bind_transciever(pdu) {
			this.logger.log1(`Center got a bind_transciever on port ${this.port} with system_id ${pdu.system_id} and password ${pdu.password}`);
			session.pause();
			if (pdu.system_id === this.username && pdu.password === this.password) {
				this.logger.log1(`Connection successful`);
				session.send(pdu.response());
				session.resume();
				this.sessions.push(session);
				this.setStatus(CenterSessionStatus.CONNECTED);
				session.on('debug', (type, msg, payload) => {
					if (type.includes('pdu.')) {
						this.eventEmitter.emit(msg, payload);
						this.eventEmitter.emit(CenterSession.ANY_PDU_EVENT, payload);
					}
				});
			} else {
				this.logger.log1(`Connection failed, invalid credentials`);
				session.send(pdu.response({
					                          command_status: smpp.ESME_RBINDFAIL
				                          }));
				this.setStatus(CenterSessionStatus.WAITING_CONNECTION);
				session.close();
				this.session = null;
			}
		}

		session.on('bind_transceiver', bind_transciever.bind(this));
	}

	notify(source, destination, message) {
		return new Promise((resolve, reject) => {
			if (!this.canSend()) {
				this.logger.log1(`Cannot send message, no client connected on ${this.port} or busy`);
				reject(`Cannot send message, no client connected on ${this.port} or busy`);
				return;
			}
			this.logger.log1(`Sending notify message from ${source} to ${destination} with message ${message}`);
			this.getNextSession().submit_sm({
				                       source_addr: source,
				                       destination_addr: destination,
				                       short_message: message
			                       }, pdu => {
				resolve(pdu);
			});
		});
	}

	notifyOnInterval(source, destination, message, interval, count) {
		return new Promise((resolve, reject) => {
			if (!this.canSend() || this.busy) {
				this.logger.log1(`Cannot send many message, no clients connected to ${this.port} or busy`);
				reject(`Cannot send many message, no clients connected to ${this.port} or busy`);
				return;
			}
			this.busy = true;
			this.timer = new NanoTimer();
			let counter = 0;
			let previousUpdateCounter = 0;

			this.updateTimer = new NanoTimer();
			this.updateTimer.setInterval(() => {
				if (previousUpdateCounter !== counter) {
					this.eventEmitter.emit(CenterSession.MESSAGE_SEND_COUNTER_UPDATE_EVENT, counter);
					previousUpdateCounter = counter;
				}
			}, '', `${MESSAGE_SEND_UPDATE_DELAY / 1000} s`);

			this.timer.setInterval(() => {
				if (count > 0 && counter >= count) {
					this.cancelNotifyInterval();
				} else {
					this.notify(source, destination, message)
						.catch(e => this.logger.log1(`Error sending message: ${e}`));
					counter++;
				}
			}, '', `${interval} s`);
			resolve();
		});
	}

	cancelNotifyInterval() {
		if (!!this.timer) {
			this.timer.clearInterval();
			this.updateTimer.clearInterval();
			this.timer = null;
			this.updateTimer = null;
		}
		this.busy = false;
	}

	getNextSession() {
		if (this.sessions.length === 0) {
			return null;
		}
		let session = this.sessions[this.nextSession];
		this.nextSession = (this.nextSession + 1) % this.sessions.length;
		return session;
	}

	close() {
		this.disconnectingPromise.promise = new Promise((resolve, reject) => {
			if (this.status !== CenterSessionStatus.CONNECTED) {
				this.logger.log1(`Cannot close session, no clients bound to ${this.port}`);
				reject(`Cannot close session, no clients bound to ${this.port}`);
				return;
			}
			this.sessions.forEach(session => {
				session.close();
			});
			this.sessions = [];
			this.setStatus(CenterSessionStatus.WAITING_CONNECTION);
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
			port: this.port,
			username: this.username,
			password: this.password,
			status: this.status,
			activeSessions: this.sessions.length
		}
	}

	canSend() {
		return this.status === CenterSessionStatus.CONNECTED;
	}
}

class CenterSessionManager {
	sessionIdCounter = 0;
	logger = new Logger("CenterSessionManager");

	constructor() {
		this.servers = {};
		process.on('exit', this.cleanup.bind(this));
		process.on('SIGINT', this.cleanup.bind(this));
		process.on('SIGUSR1', this.cleanup.bind(this));
		process.on('SIGUSR2', this.cleanup.bind(this));
		process.on('uncaughtException', this.cleanup.bind(this));
	}

	createSession(port, username, password) {
		if (this.servers[port]) {
			this.logger.log1(`Center listening on ${port} already exists`);
			return this.servers[port];
		}
		this.logger.log1(`Creating center listening on ${port} with username ${username} and password ${password}`);
		let session = new CenterSession(this.sessionIdCounter++, port, username, password);
		this.addSession(session);
		return session;
	}

	addSession(server) {
		this.logger.log1(`Adding session with ID ${server.id}`);
		this.servers[server.port] = server;
	}

	deleteSession(server) {
		this.logger.log1(`Deleting server with ID ${server.id}`);
		if (server.status === CenterSessionStatus.CONNECTED) {
			server.close();
		}
		delete this.servers[server.port];
	}

	getSession(id) {
		return Object.values(this.servers).find((session) => {
			return session.id == id;
		});
	}

	serialize() {
		return Object.values(this.servers).map((servers) => {
			return servers.serialize();
		});
	}

	cleanup() {
		this.logger.log1(`Saving sessions to ${CENTER_SESSIONS_FILE}...`);
		fs.writeFileSync(CENTER_SESSIONS_FILE, JSON.stringify(this.serialize(), null, 4));
		process.exit(0);
	}

	startup() {
		try {
			let servers = fs.readFileSync(CENTER_SESSIONS_FILE);
			servers = JSON.parse(servers);
			this.logger.log1(`Loaded ${servers.length} sessions from ${CENTER_SESSIONS_FILE}...`);
			servers.forEach(server => {
				this.createSession(server.port, server.username, server.password);
			});
		} catch (e) {
			this.logger.log1(`Error loading sessions from ${CLIENT_SESSIONS_FILE}: ${e}`);
		}
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

		app.get('/api/center', this.getCenterSessions.bind(this));
		app.post('/api/center', this.createCenterSession.bind(this));
		app.get('/api/center/:id', this.getCenterSessionById.bind(this));
		app.post('/api/center/:id/send', this.notify.bind(this));
		app.post('/api/center/:id/sendMany', this.notifyMany.bind(this));
		app.delete('/api/center/:id/sendMany', this.cancelNotifyMany.bind(this));
		app.delete('/api/center/:id/connect', this.disconnectCenterSession.bind(this));
		app.delete('/api/center/:id', this.deleteCenterServer.bind(this));

		this.server = app.listen(SERVER_PORT, function() {
			this.logger.log1(`HTTPServer listening at http://localhost:${SERVER_PORT}`)
		}.bind(this));
	}

	// TODO: These requests deserve error handling

	getClientSessions(req, res) {
		this.logger.log1("Getting client sessions");
		res.send(JSON.stringify(clientSessionManager.serialize()));
	}

	createClientSession(req, res) {
		this.logger.log1("Creating client session");
		let session = clientSessionManager.createSession(req.body.url, req.body.username, req.body.password);
		res.send(JSON.stringify(session.serialize()));
	}

	getClientSessionById(req, res) {
		let session = clientSessionManager.getSession(req.params.id);
		this.logger.log1(`Getting client session by ID ${req.params.id}`);
		if (session) {
			this.logger.log1(`Client session found with ID ${req.params.id}`)
			res.send(JSON.stringify(session.serialize()));
		} else {
			this.logger.log1(`No client session found with ID ${req.params.id}`);
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
		this.logger.log1(`Binding client session with ID ${req.params.id}`)
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
		this.logger.log1(`Connecting client session with ID ${req.params.id}`)
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
		this.logger.log1(`Disconnecting client session with ID ${req.params.id}`)
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
		this.logger.log1(`Deleting client session with ID ${req.params.id}`);
		let session = clientSessionManager.getSession(req.params.id);
		if (session) {
			clientSessionManager.deleteSession(session);
			res.send();
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	getCenterSessions(req, res) {
		this.logger.log1("Getting center sessions");
		res.send(JSON.stringify(centerSessionManager.serialize()));
	}

	createCenterSession(req, res) {
		this.logger.log1("Creating center session");
		let session = centerSessionManager.createSession(req.body.port, req.body.username, req.body.password);
		res.send(JSON.stringify(session.serialize()));
	}

	getCenterSessionById(req, res) {
		let session = centerSessionManager.getSession(req.params.id);
		this.logger.log1(`Getting center session by ID ${req.params.id}`);
		if (session) {
			this.logger.log1(`Center session found with ID ${req.params.id}`)
			res.send(JSON.stringify(session.serialize()));
		} else {
			this.logger.log1(`No center session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	notify(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
		let source = req.body.source;
		let destination = req.body.destination;
		let message = req.body.message;
		this.logger.log1(`Sending notify message from ${source} to ${destination} with message ${message} on session with ID ${req.params.id}`)
		if (server) {
			server.notify(source, destination, message)
				.then(pdu => res.send(JSON.stringify(pdu)))
				.catch(err => res.status(400).send(JSON.stringify(err)));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	notifyMany(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
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
			`Sending ${count} notify messages from ${source} to ${destination} with message ${message} on session with ID ${req.params.id} at a rate of ${perSecond} per second.`);
		if (server) {
			server.notifyOnInterval(source, destination, message, interval, count)
				.then(pdu => res.send(JSON.stringify(pdu)))
				.catch(err => res.status(400).send(JSON.stringify(err)));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	cancelNotifyMany(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
		if (!server.busy) {
			res.status(400).send({
				                     err: true,
				                     msg: `Session with ID ${req.params.id} is not sending messages`
			                     });
			return;
		}
		this.logger.log1(`Cancelling send timer for server with ID ${req.params.id}`);
		if (server) {
			server.cancelNotifyInterval();
			res.send();
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	disconnectCenterSession(req, res) {
		this.logger.log1(`Disconnecting center session with ID ${req.params.id}`)
		let server = centerSessionManager.getSession(req.params.id);
		if (server) {
			server.close()
				.then(() => res.send(JSON.stringify(server.serialize())))
				.catch(err => res.status(400).send({
					                                   err: true,
					                                   msg: err
				                                   }));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	deleteCenterServer(req, res) {
		this.logger.log1(`Deleting center session with ID ${req.params.id}`);
		let server = centerSessionManager.getSession(req.params.id);
		if (server) {
			centerSessionManager.deleteSession(server);
			res.send();
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}
}

class WSServer {
	// TODO: Implement center adding and removing...
	// TODO: This will probably have to be reworked a little to accommodate centers.
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
				session.on(ClientSession.STATUS_CHANGED_EVENT, this.onSessionChange.bind(this, sessionId));
				session.on(ClientSession.ANY_PDU_EVENT, this.pduEvent.bind(this, sessionId));
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
let centerSessionManager = new CenterSessionManager();
clientSessionManager.startup();
centerSessionManager.startup();

let session = clientSessionManager.createSession('smpp://localhost:7001', 'test', 'test');
// let server = centerSessionManager.createSession(3734, 'test', 'test');
session.connect().then(() => session.bind());

new WSServer();
new HTTPServer();