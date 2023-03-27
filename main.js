const smpp = require("smpp");
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const NanoTimer = require('nanotimer');

const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const {PDU} = require("smpp");

const SERVER_PORT = process.env.SERVER_PORT || 8190;
const WS_SERVER_PORT = process.env.WS_SERVER_PORT || 8191;
const CLIENT_SESSIONS_FILE = process.env.CLIENT_SESSIONS_FILE || "client_sessions.json";
const CENTER_SESSIONS_FILE = process.env.CENTER_SESSIONS_FILE || "center_sessions.json";
const MESSAGE_SEND_UPDATE_DELAY = process.env.MESSAGE_SEND_UPDATE_DELAY || 500;

// TODO: Add support for encodings
// TODO: Implement some sort of metrics on frontend by counting the pdus

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
	static BUSY = "BUSY";
	static BINDING = "BINDING";
	static BOUND = "BOUND";
	static NOT_CONNECTED = "NOT CONNECTED";
}

class ClientSession {
	// TODO: Enable requesting DRs
	auto_enquire_link_period = 500;
	eventEmitter = new EventEmitter();
	configuredMessageJob = {
		source: "",
		destination: "",
		message: "",
	};
	configuredMultiMessageJob = {
		source: "",
		destination: "",
		message: "",
		interval: 1000,
		count: 1,
	};

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

		this.logger.log1(`Client created with url ${this.url}, username ${this.username}, password ${this.password} and ID ${this.id}`);
		this.status = ClientSessionStatus.NOT_CONNECTED;
	}

	setUsername(username) {
		this.username = username;
		this.refresh();
	}

	setPassword(password) {
		this.password = password;
		this.refresh();
	}

	refresh() {
		this.logger.log1(`Refreshing client with url ${this.url} and id ${this.id}`);
		let status = this.status;
		this.close().catch(err => err);
		if (status === ClientSessionStatus.CONNECTED) {
			this.connect().catch(err => this.logger.log1(err));
		}
		if (status === ClientSessionStatus.BOUND) {
			this.connect().then(() => {
				this.bind().catch((err => this.logger.log1(err)));
			}).catch((err => this.logger.log1(err)));
		}
	}

	setStatus(newStatus) {
		this.status = newStatus;
		this.eventEmitter.emit(ClientSession.STATUS_CHANGED_EVENT, newStatus);
	}

	connect() {
		this.connectingPromise.promise = new Promise((resolve, reject) => {
			if (this.status !== ClientSessionStatus.NOT_CONNECTED) {
				this.logger.log1("Client already connected");
				reject("Client already connected");
				return;
			}
			this.logger.log1(`Client connecting to ${this.url}`);
			this.setStatus(ClientSessionStatus.CONNECTING);
			try {
				this.session = smpp.connect({
					                            url: this.url,
					                            auto_enquire_link_period: this.auto_enquire_link_period,
				                            }, this.connected.bind(this));
				this.session.on('error', this.error.bind(this));
				this.session.on('close', this.closed.bind(this));
			} catch (e) {
				this.logger.log1("Client connection failed to " + this.url);
				this.setStatus(ClientSessionStatus.NOT_CONNECTED);
				this.session.close();
				reject("Client connection failed to " + this.url);
			}
			this.connectingPromise.resolve = resolve;
			this.connectingPromise.reject = reject;
		});
		return this.connectingPromise.promise;
	}

	closed() {
		this.logger.log1(`Client closed connection to ${this.url}`);
		this.setStatus(ClientSessionStatus.NOT_CONNECTED);
	}

	error(error) {
		if (error.code === "ETIMEOUT") {
			this.logger.log1("Client connection timed out to " + this.url);
		} else if (error.code === "ECONNREFUSED") {
			this.logger.log1("Client connection refused to " + this.url);
		} else {
			this.logger.log1("Client connection failed to " + this.url);
		}
		this.session.close();
		this.connectingPromise.reject(error);
		this.setStatus(ClientSessionStatus.NOT_CONNECTED);
	}

	connected() {
		this.logger.log1("Client connected to " + this.url);
		this.setStatus(ClientSessionStatus.CONNECTED);
		this.session.on('debug', (type, msg, payload) => {
			if (type.includes('pdu.')) {
				this.eventEmitter.emit(msg, payload);
				this.eventEmitter.emit(ClientSession.ANY_PDU_EVENT, payload);
			}
		});
		this.session.on('pdu', this.sessionPdu.bind(this));
		this.connectingPromise.resolve();
	}

	sessionPdu(pdu) {
		if (pdu.command === 'deliver_sm') {
			this.session.send(pdu.response());
		}
	}

	bind() {
		this.bindingPromise.promise = new Promise((resolve, reject) => {
			if (this.status !== ClientSessionStatus.CONNECTED) {
				this.logger.log1(`Cannot bind, client not connected to ${this.url}`);
				reject(`Cannot bind, client not connected to ${this.url}`);
				return;
			}

			this.logger.log1("Trying to bind to " + this.url)
			if (this.status !== ClientSessionStatus.CONNECTED) {
				this.logger.log1(`Cannot bind, client not connected to ${this.url}`);
				return;
			}
			if (!!!this.username || !!!this.password) {
				this.logger.log1(`Cannot bind client, username or password not set`);
				return;
			}
			this.setStatus(ClientSessionStatus.BINDING);
			this.logger.log1(`Client binding to ${this.url} with username ${this.username} and password ${this.password}`);

			this.session.bind_transceiver({
				                              system_id: this.username,
				                              password: this.password,
				                              registered_delivery: 1
			                              }, this.bindReply.bind(this));
			this.bindingPromise.resolve = resolve;
			this.bindingPromise.reject = reject;
		});
		return this.bindingPromise.promise;
	}

	bindReply(pdu) {
		if (pdu.command_status === 0) {
			this.logger.log1(`Client bound to ${this.url} with username ${this.username} and password ${this.password}`);
			this.setStatus(ClientSessionStatus.BOUND);
			this.bindingPromise.resolve();
		} else {
			this.logger.log1(`Client bind failed to ${this.url} with username ${this.username} and password ${this.password}`);
			this.setStatus(ClientSessionStatus.CONNECTED);
			this.bindingPromise.reject();
		}
	}

	send(source, destination, message, force=false) {
		return new Promise((resolve, reject) => {
			if (!force && !this.canSend()) {
				this.logger.log1(`Client cannot send message, not bound to ${this.url} or busy`);
				reject(`Client cannot send message, not bound to ${this.url} or busy`);
				return;
			}
			this.logger.log1(`Client sending message from ${source} to ${destination} with message ${message}`);
			this.session.submit_sm({
				                       source_addr: source,
				                       destination_addr: destination,
				                       short_message: message,
				                       registered_delivery: 1,
				                       message_id: 10
			                       }, pdu => {
				resolve(pdu);
			});
		});
	}

	sendDefault() {
		return this.send(this.configuredMessageJob.source, this.configuredMessageJob.destination, this.configuredMessageJob.message);
	}

	configureDefault(source, destination, message) {
		this.configuredMessageJob = {
			source: source,
			destination: destination,
			message: message
		}
	}

	sendOnInterval(source, destination, message, interval, count) {
		return new Promise((resolve, reject) => {
			if (!this.canSend()) {
				this.logger.log1(`Client cannot send many message, not bound to ${this.url} or busy`);
				reject(`Client cannot send many message, not bound to ${this.url} or busy`);
				return;
			}
			this.setStatus(ClientSessionStatus.BUSY);
			let counter = 0;
			let previousUpdateCounter = 0;

			this.updateTimer = new NanoTimer();
			this.updateTimer.setInterval(() => {
				if (previousUpdateCounter !== counter) {
					this.eventEmitter.emit(ClientSession.MESSAGE_SEND_COUNTER_UPDATE_EVENT, counter);
					previousUpdateCounter = counter;
				}
			}, '', `${MESSAGE_SEND_UPDATE_DELAY / 1000} s`);

			this.timer = new NanoTimer();
			this.timer.setInterval(() => {
				if (count > 0 && counter >= count) {
					this.cancelSendInterval();
				} else {
					this.send(source, destination, message, true)
						.catch(e => this.logger.log1(`Error sending message: ${e}`));
					counter++;
				}
			}, '', `${interval} s`);
			resolve();
		});
	}

	sendDefaultInterval() {
		return this.sendOnInterval(this.configuredMultiMessageJob.source, this.configuredMultiMessageJob.destination, this.configuredMultiMessageJob.message,
		                           this.configuredMultiMessageJob.interval, this.configuredMultiMessageJob.count);
	}

	configureDefaultInterval(source, destination, message, interval, count) {
		this.configuredMultiMessageJob = {
			source: source,
			destination: destination,
			message: message,
			interval: interval,
			count: count
		}
	}

	cancelSendInterval() {
		if (!!this.timer) {
			this.timer.clearInterval();
			this.updateTimer.clearInterval();
			this.timer = null;
			this.updateTimer = null;
		}
		this.setStatus(ClientSessionStatus.BOUND);
	}

	close() {
		this.disconnectingPromise.promise = new Promise((resolve, reject) => {
			if (this.status !== ClientSessionStatus.BOUND && this.status !== ClientSessionStatus.CONNECTED) {
				this.logger.log1(`Cannot close client, not bound to ${this.url}`);
				reject(`Cannot close client, not bound to ${this.url}`);
				return;
			}
			this.logger.log1(`Client closing connection to ${this.url}`);
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
			status: this.status,
			configuredMessageJob: this.configuredMessageJob,
			configuredMultiMessageJob: this.configuredMultiMessageJob
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
	}

	createSession(url, username, password) {
		let urlB64 = btoa(url);
		if (this.sessions[urlB64]) {
			this.logger.log1(`Client to ${url} already exists`);
			return this.sessions[urlB64];
		}
		this.logger.log1(`Creating client to ${url} with username ${username} and password ${password}`);
		let session = new ClientSession(this.sessionIdCounter++, url, username, password);
		this.addSession(session);
		return session;
	}

	addSession(session) {
		this.logger.log1(`Adding client with ID ${session.id}`);
		this.sessions[btoa(session.url)] = session;
	}

	deleteSession(session) {
		this.logger.log1(`Deleting client with ID ${session.id}`);
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
		this.logger.log1(`Saving clients to ${CLIENT_SESSIONS_FILE}...`);
		fs.writeFileSync(CLIENT_SESSIONS_FILE, JSON.stringify(this.serialize(), null, 4));
	}

	startup() {
		try {
			let sessions = fs.readFileSync(CLIENT_SESSIONS_FILE);
			sessions = JSON.parse(sessions);
			this.logger.log1(`Loaded ${sessions.length} clients from ${CLIENT_SESSIONS_FILE}...`);
			sessions.forEach(session => {
				let sessionObj = this.createSession(session.url, session.username, session.password);
				sessionObj.configuredMessageJob = session.configuredMessageJob;
				sessionObj.configuredMultiMessageJob = session.configuredMultiMessageJob;
			});
		} catch (e) {
			this.logger.log1(`Error loading clients from ${CLIENT_SESSIONS_FILE}: ${e}`);
		}
	}
}

class CenterSessionStatus {
	static CONNECTED = "CONNECTED";
	static WAITING_CONNECTION = "WAITING CONNECTION";
	static CONNECTION_PENDING = "CONNECTION PENDING";
	static BUSY = "BUSY";
}

class CenterMode {
	static DEBUG = "DEBUG";
	static ECHO = "ECHO";
	static DR = "DR";
}

class CenterSession {
	// TODO: If the port is in use this throws an exception, catch it and log it
	eventEmitter = new EventEmitter();
	sessions = [];
	nextSession = 0;
	mode = CenterMode.DEBUG;
	configuredMessageJob = {
		source: "",
		destination: "",
		message: "",
	};
	configuredMultiMessageJob = {
		source: "",
		destination: "",
		message: "",
		interval: 1000,
		count: 1,
	};

	disconnectingPromise = {
		promise: null,
		resolve: null,
		reject: null
	}

	static STATUS_CHANGED_EVENT = "statusChanged";
	static MODE_CHANGED_EVENT = "modeChanged";
	static SESSION_CHANGED_EVENT = "sessionChanged";
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

		this.logger.log1(`Center created with port ${this.port}, username ${this.username}, password ${this.password} and ID ${this.id}`);
		this.status = CenterSessionStatus.WAITING_CONNECTION;
	}

	setStatus(newStatus) {
		this.status = newStatus;
		this.eventEmitter.emit(CenterSession.STATUS_CHANGED_EVENT, newStatus);
	}

	setUsername(username) {
		this.username = username;
		this.refresh();
	}

	setPassword(password) {
		this.password = password;
		this.refresh();
	}

	setMode(mode) {
		this.mode = Object.values(CenterMode)[mode];
		this.eventEmitter.emit(CenterSession.MODE_CHANGED_EVENT, mode);
	}

	refresh() {
		this.close().catch(err => {
		});
	}

	error(error) {
		if (error.code === "ETIMEOUT") {
			this.logger.log1("Center connection timed out to " + this.port);
		} else if (error.code === "ECONNREFUSED") {
			this.logger.log1("Center connection refused to " + this.port);
		} else {
			this.logger.log1("Center connection failed to " + this.port);
		}
		this.logger.log1(`Session on center croaked. Error: ${error}`);
		this.setStatus(CenterSessionStatus.CONNECTION_PENDING);
	}

	connected(session) {
		this.logger.log1("Center got a connection on port " + this.port);
		this.setStatus(CenterSessionStatus.CONNECTION_PENDING);

		session.on('error', this.error.bind(this));
		session.on('close', this.sessionClosed.bind(this, session));

		function bind_transciever(pdu) {
			this.logger.log1(`Center got a bind_transciever on port ${this.port} with system_id ${pdu.system_id} and password ${pdu.password}`);
			session.pause();
			if (pdu.system_id === this.username && pdu.password === this.password) {
				this.logger.log1(`Center session connection successful`);
				session.send(pdu.response());
				session.resume();
				session.on('pdu', this.sessionPdu.bind(this, session));
				this.addSession(session);
				if (this.sessions.length > 0) {
					this.setStatus(CenterSessionStatus.CONNECTED);
				}
				session.on('debug', (type, msg, payload) => {
					if (type.includes('pdu.')) {
						this.eventEmitter.emit(msg, payload);
						this.eventEmitter.emit(CenterSession.ANY_PDU_EVENT, payload);
					}
				});
			} else {
				this.logger.log1(`Center session connection failed, invalid credentials`);
				session.send(pdu.response({
					                          command_status: smpp.ESME_RBINDFAIL
				                          }));
				if (this.sessions.length === 0) {
					this.setStatus(CenterSessionStatus.WAITING_CONNECTION);
				}
				session.close();
				this.session = null;
			}
		}

		session.on('bind_transceiver', bind_transciever.bind(this));
	}

	sessionClosed(session) {
		this.logger.log1(`Center session closed on port ${this.port}`);
		delete this.sessions[this.sessions.indexOf(session)];
		this.sessions = this.sessions.filter(Boolean);
		if (this.sessions.length === 0) {
			this.setStatus(CenterSessionStatus.WAITING_CONNECTION);
		}
	}

	sessionPdu(session, pdu) {
		if (pdu.command === 'submit_sm') {
			session.send(pdu.response());
			if (this.mode === CenterMode.ECHO) {
				this.notify(pdu.destination_addr, pdu.source_addr, pdu.short_message);
			}
			// TODO: Figure out how DRs work
			if (this.mode === CenterMode.DR && pdu.registered_delivery === 1) {
				let drPdu = new PDU('deliver_sm', {
					receipted_message_id: pdu.message_id,
					esm_class: 4,
					message_state: 2,
					length: 0,
				});
				this.send(drPdu).catch(err => console.log(err));
			}
		}
		if (pdu.command === 'enquire_link') {
			session.send(pdu.response());
		}
	}

	configureDefault(source, destination, message) {
		this.configuredMessageJob = {
			source: source,
			destination: destination,
			message: message
		}
	}

	notifyDefault() {
		return this.notify(this.configuredMessageJob.source, this.configuredMessageJob.destination, this.configuredMessageJob.message);
	}

	notify(source, destination, message, force=false) {
		return new Promise((resolve, reject) => {
			if (!force && !this.canSend()) {
				this.logger.log1(`Center cannot send message, no sessions active on ${this.port} or busy`);
				reject(`Center cannot send message, no sessions active on ${this.port} or busy`);
				return;
			}
			this.logger.log1(`Sending notify message from ${source} to ${destination} with message ${message}`);
			this.getNextSession().deliver_sm({
				                                 source_addr: source,
				                                 destination_addr: destination,
				                                 short_message: message,
			                                 }, pdu => {
				resolve(pdu);
			});
		});
	}

	send(pdu) {
		return new Promise((resolve, reject) => {
			if (!this.canSend()) {
				this.logger.log1(`Center cannot send message, no sessions active on ${this.port} or busy`);
				reject(`Center cannot send message, no sessions active on ${this.port} or busy`);
				return;
			}
			this.getNextSession().send(pdu, pdu => {
				resolve(pdu);
			});
		});
	}

	configureDefaultInterval(source, destination, message, interval, count) {
		this.configuredMultiMessageJob = {
			source: source,
			destination: destination,
			message: message,
			interval: interval,
			count: count
		}
	}

	notifyDefaultInterval() {
		return this.notifyOnInterval(this.configuredMultiMessageJob.source, this.configuredMultiMessageJob.destination, this.configuredMultiMessageJob.message,
		                             this.configuredMultiMessageJob.interval, this.configuredMultiMessageJob.count);
	}

	notifyOnInterval(source, destination, message, interval, count) {
		return new Promise((resolve, reject) => {
			if (!this.canSend()) {
				this.logger.log1(`Center cannot send many message, no sessions active to ${this.port} or busy`);
				reject(`Center cannot send many message, no sessions active to ${this.port} or busy`);
				return;
			}
			this.setStatus(CenterSessionStatus.BUSY);
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
					this.notify(source, destination, message, true)
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
		this.setStatus(CenterSessionStatus.CONNECTED);
	}

	getNextSession() {
		if (this.sessions.length === 0) {
			return null;
		}
		let session = this.sessions[this.nextSession];
		this.nextSession = (this.nextSession + 1) % this.sessions.length;
		return session;
	}

	getSessions() {
		return this.sessions.map(session => {
			return this.mapSession(session);
		})
	}

	mapSession(session) {
		return {
			closed: session.closed,
			paused: session.paused,
			remoteAddress: session.remoteAddress,
			remotePort: session.remotePort,
			_id: session._id,
			deleted: session.deleted || false
		}
	}

	closeSession(sessionId) {
		this.logger.log1(`Closing center session ${sessionId}`);
		let session = this.sessions.find(session => session._id == sessionId);
		if (!!session) {
			session.close();
			this.eventEmitter.emit(CenterSession.SESSION_CHANGED_EVENT, this.mapSession(session));
		}
	}

	deleteSession(sessionId) {
		this.logger.log1(`Deleting center session ${sessionId}`);
		let session = this.sessions.find(session => session._id == sessionId);
		if (!!session) {
			session.close();
			session.destroy();
			session.deleted = true;
			this.eventEmitter.emit(CenterSession.SESSION_CHANGED_EVENT, this.mapSession(session));
			delete this.sessions[this.sessions.indexOf(session)];
			this.sessions = this.sessions.filter(Boolean);
		}
	}

	addSession(session) {
		this.logger.log1(`Adding center session ${session._id}`);
		let sessionInfo = this.mapSession(session);
		this.eventEmitter.emit(CenterSession.SESSION_CHANGED_EVENT, sessionInfo);
		this.sessions.push(session);
	}

	close() {
		this.disconnectingPromise.promise = new Promise((resolve, reject) => {
			if (this.status !== CenterSessionStatus.CONNECTED) {
				this.logger.log1(`Cannot close center, no sessions active ${this.port}`);
				reject(`Cannot close center, no sessions active ${this.port}`);
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
			activeSessions: this.sessions.length,
			mode: this.mode,
			configuredMessageJob: this.configuredMessageJob,
			configuredMultiMessageJob: this.configuredMultiMessageJob,
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
		this.logger.log1(`Adding center with ID ${server.id}`);
		this.servers[server.port] = server;
	}

	deleteSession(server) {
		this.logger.log1(`Deleting center with ID ${server.id}`);
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
		this.logger.log1(`Saving centers to ${CENTER_SESSIONS_FILE}...`);
		fs.writeFileSync(CENTER_SESSIONS_FILE, JSON.stringify(this.serialize(), null, 4));
	}

	startup() {
		try {
			let servers = fs.readFileSync(CENTER_SESSIONS_FILE);
			servers = JSON.parse(servers);
			this.logger.log1(`Loaded ${servers.length} centers from ${CENTER_SESSIONS_FILE}...`);
			servers.forEach(server => {
				let createdServer = this.createSession(server.port, server.username, server.password);
				if (!!server.mode) {
					createdServer.mode = server.mode;
				}
				createdServer.configuredMessageJob = server.configuredMessageJob;
				createdServer.configuredMultiMessageJob = server.configuredMultiMessageJob;
			});
		} catch (e) {
			this.logger.log1(`Error loading centers from ${CLIENT_SESSIONS_FILE}: ${e}`);
		}
	}

	getAvailableCenterModes() {
		let modes = Object.values(CenterMode);
		return modes.reduce((acc, curr, idx) => {
			acc[idx] = curr;
			return acc;
		}, {});
	}
}


class HTTPServer {
	logger = new Logger("HTTPServer");

	constructor() {
		app.use(bodyParser.json());

		app.get('/api/client', this.getClientSessions.bind(this));
		app.post('/api/client', this.createClientSession.bind(this));
		app.get('/api/client/:id', this.getClientSessionById.bind(this));
		app.patch('/api/client/:id', this.patchClientSession.bind(this));
		app.put('/api/client/:id/send', this.configSend.bind(this));
		app.post('/api/client/:id/send/default', this.sendConfig.bind(this));
		app.post('/api/client/:id/send', this.send.bind(this));
		app.put('/api/client/:id/sendMany', this.configSendMany.bind(this));
		app.post('/api/client/:id/sendMany/default', this.sendManyConfig.bind(this));
		app.post('/api/client/:id/sendMany', this.sendMany.bind(this));
		app.delete('/api/client/:id/sendMany', this.cancelSendMany.bind(this));
		app.post('/api/client/:id/bind', this.bindClientSession.bind(this));
		app.post('/api/client/:id/connect', this.connectClientSession.bind(this));
		app.delete('/api/client/:id/connect', this.disconnectClientSession.bind(this));
		app.delete('/api/client/:id', this.deleteClientSession.bind(this));

		app.get('/api/center', this.getCenterSessions.bind(this));
		app.post('/api/center', this.createCenterSession.bind(this));
		app.get('/api/center/modes', this.getAvailableModes.bind(this));
		app.get('/api/center/:id', this.getCenterServerById.bind(this));
		app.get('/api/center/:id/session', this.getCenterServerSessionsById.bind(this));
		app.delete('/api/center/:id/session/:sessionId', this.closeCenterServerSessionById.bind(this));
		app.delete('/api/center/:id/session/:sessionId/destroy', this.deleteCenterServerSessionById.bind(this));
		app.patch('/api/center/:id', this.patchCenterServer.bind(this));
		app.put('/api/center/:id/send', this.configNotify.bind(this));
		app.post('/api/center/:id/send/default', this.notifyConfig.bind(this));
		app.post('/api/center/:id/send', this.notify.bind(this));
		app.put('/api/center/:id/sendMany', this.configNotifyMany.bind(this));
		app.post('/api/center/:id/sendMany/default', this.notifyManyConfig.bind(this));
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
		res.send(clientSessionManager.serialize());
	}

	createClientSession(req, res) {
		this.logger.log1("Creating client session");
		let session = clientSessionManager.createSession(req.body.url, req.body.username, req.body.password);
		res.send(session.serialize());
	}

	getClientSessionById(req, res) {
		let session = clientSessionManager.getSession(req.params.id);
		this.logger.log1(`Getting client session by ID ${req.params.id}`);
		if (session) {
			this.logger.log1(`Client session found with ID ${req.params.id}`)
			res.send(session.serialize());
		} else {
			this.logger.log1(`No client session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	patchClientSession(req, res) {
		let session = clientSessionManager.getSession(req.params.id);
		if (session) {
			this.logger.log1(`Client session found with ID ${req.params.id}`)
			if (!!req.body.username && req.body.username !== session.username) {
				session.setUsername(req.body.username);
			}
			if (!!req.body.password && req.body.password !== session.password) {
				session.setPassword(req.body.password);
			}
			res.send(session.serialize());
		} else {
			this.logger.log1(`No client session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	configSend(req, res) {
		let session = clientSessionManager.getSession(req.params.id);
		let source = req.body.source;
		let destination = req.body.destination;
		let message = req.body.message;
		this.logger.log1(`Setting default message from ${source} to ${destination} with message ${message} on session with ID ${req.params.id}`)
		if (session) {
			session.configureDefault(source, destination, message);
			res.send(session.serialize());
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	sendConfig(req, res) {
		let session = clientSessionManager.getSession(req.params.id);
		this.logger.log1(`Sending pre-configured message on session with ID ${req.params.id}`)
		if (session) {
			session.sendDefault()
				.then(pdu => res.send(pdu))
				.catch(err => res.status(400).send(JSON.stringify(err)));
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
				.then(pdu => res.send(pdu))
				.catch(err => res.status(400).send(JSON.stringify(err)));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	configSendMany(req, res) {
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
			`Setting default ${count} messages from ${source} to ${destination} with message ${message} on session with ID ${req.params.id} at a rate of ${perSecond} per second.`);
		if (session) {
			session.configureDefaultInterval(source, destination, message, interval, count);
			res.send(session.serialize());
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	sendManyConfig(req, res) {
		let session = clientSessionManager.getSession(req.params.id);
		this.logger.log1(`Sending pre-configured messages on session with ID ${req.params.id}`)
		if (session) {
			session.sendDefaultInterval()
				.then(() => res.send({}))
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
				.then(pdu => res.send(pdu))
				.catch(err => res.status(400).send((err)));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	cancelSendMany(req, res) {
		let session = clientSessionManager.getSession(req.params.id);
		if (session.status !== ClientSessionStatus.BUSY) {
			res.status(400).send({
				                     err: true,
				                     msg: `Session with ID ${req.params.id} is not sending messages`
			                     });
			return;
		}
		this.logger.log1(`Cancelling send timer for session with ID ${req.params.id}`);
		if (session) {
			session.cancelSendInterval();
			res.send({});
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
				.then(() => res.send(session.serialize()))
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
				.then(() => res.send(session.serialize()))
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
				.then(() => res.send(session.serialize()))
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
			res.send({});
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	getCenterSessions(req, res) {
		this.logger.log1("Getting center sessions");
		res.send(centerSessionManager.serialize());
	}

	createCenterSession(req, res) {
		this.logger.log1("Creating center session");
		let session = centerSessionManager.createSession(req.body.port, req.body.username, req.body.password);
		res.send(session.serialize());
	}

	getCenterServerById(req, res) {
		let session = centerSessionManager.getSession(req.params.id);
		this.logger.log1(`Getting center session by ID ${req.params.id}`);
		if (session) {
			this.logger.log1(`Center session found with ID ${req.params.id}`)
			res.send(session.serialize());
		} else {
			this.logger.log1(`No center session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	getCenterServerSessionsById(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
		this.logger.log1(`Getting center session by ID ${req.params.id}`);
		if (server) {
			this.logger.log1(`Center session found with ID ${req.params.id}`)
			res.send(server.getSessions());
		} else {
			this.logger.log1(`No center session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	closeCenterServerSessionById(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
		this.logger.log1(`Getting center session by ID ${req.params.id}`);
		if (server) {
			this.logger.log1(`Center session found with ID ${req.params.id}`)
			server.closeSession(req.params.sessionId)
			res.send({});
		} else {
			this.logger.log1(`No center session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	deleteCenterServerSessionById(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
		this.logger.log1(`Getting center session by ID ${req.params.id}`);
		if (server) {
			this.logger.log1(`Center session found with ID ${req.params.id}`)
			server.deleteSession(req.params.sessionId)
			res.send({});
		} else {
			this.logger.log1(`No center session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	patchCenterServer(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
		if (server) {
			this.logger.log1(`Center server found with ID ${req.params.id}`)
			if (!!req.body.username && req.body.username !== server.username) {
				server.setUsername(req.body.username);
			}
			if (!!req.body.password && req.body.password !== server.password) {
				server.setPassword(req.body.password);
			}
			if (!!req.body.mode) {
				server.setMode(req.body.mode);
			}
			res.send(server.serialize());
		} else {
			this.logger.log1(`No center server found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	getAvailableModes(req, res) {
		this.logger.log1("Getting available modes");
		res.send(centerSessionManager.getAvailableCenterModes());
	}

	configNotify(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
		let source = req.body.source;
		let destination = req.body.destination;
		let message = req.body.message;
		this.logger.log1(`Setting default message from ${source} to ${destination} with message ${message} on server with ID ${req.params.id}`)
		if (server) {
			server.configureDefault(source, destination, message);
			res.send(server.serialize());
		} else {
			this.logger.log1(`No server found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	notifyConfig(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
		this.logger.log1(`Sending pre-configured message on server with ID ${req.params.id}`)
		if (server) {
			server.notifyDefault()
				.then(pdu => res.send(pdu))
				.catch(err => res.status(400).send(JSON.stringify(err)));
		} else {
			this.logger.log1(`No server found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	notify(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
		let source = req.body.source;
		let destination = req.body.destination;
		let message = req.body.message;
		this.logger.log1(`Sending notify message from ${source} to ${destination} with message ${message} on server with ID ${req.params.id}`)
		if (server) {
			server.notify(source, destination, message)
				.then(pdu => res.send(pdu))
				.catch(err => res.status(400).send(err));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	configNotifyMany(req, res) {
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
			`Setting default ${count} messages from ${source} to ${destination} with message ${message} on server with ID ${req.params.id} at a rate of ${perSecond} per second.`);
		if (server) {
			server.configureDefaultInterval(source, destination, message, interval, count);
			res.send(server.serialize());
		} else {
			this.logger.log1(`No server found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	notifyManyConfig(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
		this.logger.log1(`Sending pre-configured messages on server with ID ${req.params.id}`)
		if (server) {
			server.notifyDefaultInterval()
				.then(pdu => res.send(pdu))
				.catch(err => res.status(400).send(JSON.stringify(err)));
		} else {
			this.logger.log1(`No server found with ID ${req.params.id}`);
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
				.then(pdu => res.send(pdu))
				.catch(err => res.status(400).send(err));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	cancelNotifyMany(req, res) {
		let server = centerSessionManager.getSession(req.params.id);
		if (server.status !== ClientSessionStatus.BUSY) {
			res.status(400).send({
				                     err: true,
				                     msg: `Session with ID ${req.params.id} is not sending messages`
			                     });
			return;
		}
		this.logger.log1(`Cancelling send timer for server with ID ${req.params.id}`);
		if (server) {
			server.cancelNotifyInterval();
			res.send({});
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
				.then(() => res.send(server.serialize()))
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
			res.send({});
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}
}

class WSServer {
	clients = {};
	unknownClients = [];
	listenersAlreadySetup = [];

	constructor() {
		this.server = new WebSocket.Server({port: WS_SERVER_PORT});
		this.logger = new Logger("WSServer");
		this.server.on('connection', this.onConnection.bind(this));
		this.logger.log1(`WSServer listening at ws://localhost:${WS_SERVER_PORT}`);
	}

	onConnection(ws) {
		this.logger.log1("New connection");
		this.unknownClients.push(ws);
		ws.on('message', this.onMessage.bind(this, ws));
		ws.on('close', this.onClose.bind(this, ws));
	}

	addClient(ws, type, sessionId) {
		if (!this.clients[type]) {
			this.clients[type] = {};
		}
		if (!this.clients[type][sessionId]) {
			this.clients[type][sessionId] = [];
		}
		this.logger.log1(`Adding client ${ws.id} to ${type} session ${sessionId}`);

		if (type === "client") {
			if (this.listenersAlreadySetup.indexOf(`client-${sessionId}`) === -1) {
				let session = clientSessionManager.getSession(sessionId);
				if (!!session) {
					this.logger.log1(`Setting up listeners for client session ${sessionId}`);
					session.on(ClientSession.STATUS_CHANGED_EVENT, this.onClientSessionStatusChange.bind(this, sessionId));
					session.on(ClientSession.ANY_PDU_EVENT, this.onClientSessionPdu.bind(this, sessionId));
					session.on(ClientSession.MESSAGE_SEND_COUNTER_UPDATE_EVENT, this.onClientMessageCounterUpdate.bind(this, sessionId));
				}
				this.listenersAlreadySetup.push(`client-${sessionId}`);
			} else {
				this.logger.log1(`Listeners for client session ${sessionId} already set up`);
			}
		} else if (type === "center") {
			if (this.listenersAlreadySetup.indexOf(`center-${sessionId}`) === -1) {
				let session = centerSessionManager.getSession(sessionId);
				if (!!session) {
					this.logger.log1(`Setting up listeners for center session ${sessionId}`);
					session.on(CenterSession.STATUS_CHANGED_EVENT, this.onCenterStatusChange.bind(this, sessionId));
					session.on(CenterSession.ANY_PDU_EVENT, this.onCenterServerPdu.bind(this, sessionId));
					session.on(CenterSession.MODE_CHANGED_EVENT, this.onCenterModeChanged.bind(this, sessionId));
					session.on(CenterSession.SESSION_CHANGED_EVENT, this.onCenterSessionsChanged.bind(this, sessionId));
					session.on(ClientSession.MESSAGE_SEND_COUNTER_UPDATE_EVENT, this.onCenterMessageCounterUpdate.bind(this, sessionId));
				}
				this.listenersAlreadySetup.push(`center-${sessionId}`);
			} else {
				this.logger.log1(`Listeners for center session ${sessionId} already set up`);
			}
		}

		this.clients[type][sessionId].push(ws);
		this.logger.log1(`Now active ${this.clients[type][sessionId].length} clients in session ID: ${sessionId} of type ${type}`);
	}

	onMessage(ws, message) {
		this.logger.log1("New message");
		message = String(message);
		let data = message.split(":");
		let type = data[0];
		let sessionId = data[1];

		this.logger.log1(`Moving client to session ID: ${sessionId} of type ${type}`);
		delete this.unknownClients[ws];
		this.unknownClients = this.unknownClients.filter(Boolean);

		this.addClient(ws, type, sessionId);
		this.logger.log1(`Now active ${this.clients[type][sessionId].length} clients in session ID: ${sessionId} of type ${type}`);
	}

	onClose(ws) {
		this.removeClient(ws);
		// this.logger.log6(this.clients);
		this.logger.log1("Connection closed");
	}

	removeClient(ws) {
		this.clients.client = this.removeFromArray(this.clients.client, ws);
		this.clients.center = this.removeFromArray(this.clients.center, ws);
	}

	removeFromArray(array, element) {
		for (let sessionId in array) {
			let index = array[sessionId].indexOf(element);
			if (index > -1) {
				delete array[sessionId][index];
			}
			array[sessionId] = array[sessionId].filter(Boolean);
			if (array[sessionId].length === 0) {
				delete array[sessionId];
			}
		}
		return array;
	}

	onClientSessionStatusChange(sessionId, newStatus) {
		this.logger.log1(`Session with ID ${sessionId} changed`);
		let payload = {
			objectType: "client",
			type: 'status',
			sessionId: sessionId,
			value: newStatus
		}
		let clients = this.clients["client"][sessionId];
		if (!!clients) {
			this.logger.log1(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
			clients.forEach(client => {
				client.send(JSON.stringify(payload));
			});
		}
	}

	onClientSessionPdu(sessionId, pdu) {
		// TODO: Maybe move this to an "ignored" array against who the pdu.command is compared
		if (pdu.command === 'enquire_link_resp' || pdu.command === 'enquire_link') {
			return;
		}
		let clients = this.clients["client"][sessionId];
		if (!!clients) {
			this.logger.log2(`Session with ID ${sessionId} fired PDU`);
			let payload = {
				objectType: "client",
				type: 'pdu',
				sessionId: sessionId,
				value: pdu
			}
			this.logger.log2(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
			clients.forEach(client => {
				client.send(JSON.stringify(payload));
			});
		}
	}

	onClientMessageCounterUpdate(sessionId, counter) {
		this.logger.log2(`Session with ID ${sessionId} updating message send counter`);
		let payload = {
			objectType: "client",
			type: 'counterUpdate',
			sessionId: sessionId,
			value: counter
		}
		let clients = this.clients["client"][sessionId];
		if (!!clients) {
			this.logger.log2(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
			clients.forEach(client => {
				client.send(JSON.stringify(payload));
			});
		}
	}

	onCenterStatusChange(sessionId, newStatus) {
		this.logger.log1(`Session with ID ${sessionId} changed`);
		let payload = {
			objectType: "center",
			type: 'status',
			sessionId: sessionId,
			value: newStatus
		}
		let clients = this.clients["center"][sessionId];
		if (!!clients) {
			this.logger.log1(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
			clients.forEach(client => {
				client.send(JSON.stringify(payload));
			});
		}
	}

	onCenterServerPdu(sessionId, pdu) {
		if (pdu.command === 'enquire_link_resp' || pdu.command === 'enquire_link') {
			return;
		}
		let clients = this.clients["center"][sessionId];
		if (!!clients) {
			this.logger.log2(`Session with ID ${sessionId} fired PDU`);
			let payload = {
				objectType: "center",
				type: 'pdu',
				sessionId: sessionId,
				value: pdu
			}
			this.logger.log2(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
			clients.forEach(client => {
				client.send(JSON.stringify(payload));
			});
		}
	}

	onCenterModeChanged(sessionId, newMode) {
		this.logger.log1(`Session with ID ${sessionId} changed`);
		let payload = {
			objectType: "center",
			type: 'mode',
			sessionId: sessionId,
			value: newMode,
			text: CenterMode[newMode]
		}
		let clients = this.clients["center"][sessionId];
		if (!!clients) {
			this.logger.log1(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
			clients.forEach(client => {
				client.send(JSON.stringify(payload));
			});
		}
	}

	onCenterSessionsChanged(sessionId, newSession) {
		this.logger.log1(`Session with ID ${sessionId} changed`);
		let payload = {
			objectType: "center",
			type: 'sessions',
			sessionId: sessionId,
			value: newSession
		}
		let clients = this.clients["center"][sessionId];
		if (!!clients) {
			this.logger.log1(`Broadcasting session with ID ${sessionId} to ${clients.length} clients`);
			clients.forEach(client => {
				client.send(JSON.stringify(payload));
			});
		}
	}

	onCenterMessageCounterUpdate(sessionId, counter) {
		this.logger.log2(`Session with ID ${sessionId} updating message send counter`);
		let payload = {
			objectType: "center",
			type: 'counterUpdate',
			sessionId: sessionId,
			value: counter
		}
		let clients = this.clients["center"][sessionId];
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

// let session = clientSessionManager.createSession('smpp://localhost:7001', 'test', 'test');
// let server = centerSessionManager.createSession(7001, 'test', 'test');

let session = clientSessionManager.getSession(0);
let server = centerSessionManager.getSession(1);

session.connect()
	.then(() => {
		session.bind().then(() => {
			// setTimeout(() => session.close(), 1000);
		}).catch(err => console.log(err));
	}).catch(err => console.log(err));

// setTimeout(() => session.setUsername("test123"), 2000);
// setTimeout(() => session.setPassword("test123"), 4000);

// session.on(CenterSession.ANY_PDU_EVENT, (pdu) => {
// 	console.log(pdu);
// });

// session.on(ClientSession.ANY_PDU_EVENT, (pdu) => {
// 	if (pdu.command.includes('enquire')) {
// 		return;
// 	}
// 	console.log(pdu);
// });

new WSServer();
new HTTPServer();

function cleanup() {
	clientSessionManager.cleanup();
	centerSessionManager.cleanup();
	process.exit(0);
}

process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGUSR1', cleanup);
process.on('SIGUSR2', cleanup);