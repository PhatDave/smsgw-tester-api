const smpp = require("smpp");
const keyboard = require("keyboardjs");
const fs = require("fs");
const path = require("path");
const EventEmitter = require('events');

const express = require('express');
const app = express();
const bodyParser = require('body-parser');

const SERVER_PORT = process.env.SERVER_PORT || 8190;


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

class SessionStatus {
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

class Session {
	auto_enquire_link_period = 500;
	eventEmitter = new EventEmitter();

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

	constructor(id, url, username, password) {
		this.id = id;
		this.logger = new Logger(`Session-${this.id}`);
		this.url = url;
		this.username = username;
		this.password = password;
		if (!this.url.includes("smpp://")) {
			this.url = "smpp://" + this.url;
		}
		this.logger.log1(`Session created with url ${this.url}, username ${this.username}, password ${this.password} and ID ${this.id}`);
		this.status = SessionStatus.NOT_CONNECTED;
	}

	setStatus(newStatus) {
		this.status = newStatus;
		this.eventEmitter.emit("statusChanged", newStatus);
	}

	connect() {
		this.connectingPromise.promise = new Promise((resolve, reject) => {
			if (this.status !== SessionStatus.NOT_CONNECTED) {
				this.logger.log1("Session already connected");
				reject("Session already connected");
				return;
			}
			this.logger.log1("Connecting to " + this.url);
			this.setStatus(SessionStatus.CONNECTING);
			try {
				this.session = smpp.connect({
					                            url: this.url,
					                            auto_enquire_link_period: this.auto_enquire_link_period,
				                            }, this.connected.bind(this));
				this.session.on('error', this.clientError.bind(this));
			} catch (e) {
				this.logger.log1("Connection failed to " + this.url);
				this.setStatus(SessionStatus.CONNECT_FAILED);
				console.log(e);
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
		this.setStatus(SessionStatus.CONNECTED);
		this.session.on('debug', (type, msg, payload) => {
			if (type.includes('pdu.')) {
				this.eventEmitter.emit(msg, payload);
				this.eventEmitter.emit('*', payload);
			}
		})
		this.connectingPromise.resolve();
	}

	bind() {
		this.bindingPromise.promise = new Promise((resolve, reject) => {
			if (this.status !== SessionStatus.CONNECTED) {
				this.logger.log1(`Cannot bind, not connected to ${this.url}`);
				reject(`Cannot bind, not connected to ${this.url}`);
				return;
			}

			this.logger.log1("Trying to bind to " + this.url)
			if (this.status !== SessionStatus.CONNECTED) {
				this.logger.log1(`Cannot bind, not connected to ${this.url}`);
				return;
			}
			if (!!!this.username || !!!this.password) {
				this.logger.log1(`Cannot bind, username or password not set`);
				return;
			}
			this.setStatus(SessionStatus.BINDING);
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
			this.setStatus(SessionStatus.BOUND);
			this.bindingPromise.resolve();
		} else {
			this.logger.log1(`Bind failed to ${this.url} with username ${this.username} and password ${this.password}`);
			this.setStatus(SessionStatus.BIND_FAILED);
			this.bindingPromise.reject();
		}
	}

	send(source, destination, message) {
		if (this.status !== SessionStatus.BOUND) {
			this.logger.log1(`Cannot send message, not bound to ${this.url}`);
			return;
		}
		this.logger.log1(`Sending message from ${source} to ${destination} with message ${message}`);
		this.session.submit_sm({
			                       source_addr: source,
			                       destination_addr: destination,
			                       short_message: message
		                       }, function(pdu) {
			console.log(pdu);
		});
		this.session.close();
	}

	close() {
		this.disconnectingPromise.promise = new Promise((resolve, reject) => {
			if (this.status !== SessionStatus.BOUND) {
				this.logger.log1(`Cannot close session, not bound to ${this.url}`);
				reject(`Cannot close session, not bound to ${this.url}`);
				return;
			}
			this.session.close();
			this.setStatus(SessionStatus.NOT_CONNECTED);
			resolve();
		});
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
}

class SessionManager {
	sessionIdCounter = 0;
	logger = new Logger("SessionManager");

	constructor() {
		this.sessions = [];
	}

	createSession(url, username, password) {
		this.logger.log1(`Creating session to ${url} with username ${username} and password ${password}`);
		let session = new Session(this.sessionIdCounter++, url, username, password);
		this.addSession(session);
		return session;
	}

	addSession(session) {
		this.logger.log1(`Adding session with ID ${session.id}`);
		this.sessions.push(session);
	}

	getSessions() {
		return this.sessions;
	}

	getSession(id) {
		return this.sessions.find((session) => {
			return session.id == id;
		});
	}

	serialize() {
		return this.sessions.map((session) => {
			return session.serialize();
		});
	}
}

class HTTPServer {
	logger = new Logger("HTTPServer");

	constructor() {
		app.use(bodyParser.json());

		app.get('/api/sessions', this.getSessions.bind(this));
		app.post('/api/sessions', this.createSession.bind(this));
		app.get('/api/sessions/:id', this.getById.bind(this));
		app.post('/api/sessions/:id/send', this.send.bind(this));
		app.post('/api/sessions/:id/bind', this.bind.bind(this));
		app.post('/api/sessions/:id/connect', this.connect.bind(this));
		app.delete('/api/sessions/:id/connect', this.disconnect.bind(this));

		this.server = app.listen(SERVER_PORT, function() {
			this.logger.log1(`HTTPServer listening at http://localhost:${SERVER_PORT}`)
		}.bind(this));
	}

	getSessions(req, res) {
		this.logger.log1("Getting sessions");
		res.send(JSON.stringify(sessionManager.serialize()));
	}

	createSession(req, res) {
		this.logger.log1("Creating session");
		let session = sessionManager.createSession(req.body.url, req.body.username, req.body.password);
		res.send(JSON.stringify(session.serialize()));
	}

	getById(req, res) {
		let session = sessionManager.getSession(req.params.id);
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
		let session = sessionManager.getSession(req.params.id);
		this.logger.log1(
			`Sending message from ${req.body.source} to ${req.body.destination} with message ${req.body.message} on session with ID ${req.params.id}`)
		if (session) {
			session.send(req.body.source, req.body.destination, req.body.message);
			res.send(JSON.stringify(session.serialize()));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	bind(req, res) {
		this.logger.log1(`Binding session with ID ${req.params.id}`)
		// Maybe make this async?
		let session = sessionManager.getSession(req.params.id);
		if (session) {
			session.bind().then(() => res.send(JSON.stringify(session.serialize())))
				.catch(err => res.status(400).send(JSON.stringify(err)));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	connect(req, res) {
		this.logger.log1(`Connecting session with ID ${req.params.id}`)
		let session = sessionManager.getSession(req.params.id);
		if (session) {
			session.connect().then(() => res.send(JSON.stringify(session.serialize())))
				.catch(err => res.status(400).send(JSON.stringify(err)));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}

	disconnect(req, res) {
		this.logger.log1(`Disconnecting session with ID ${req.params.id}`)
		let session = sessionManager.getSession(req.params.id);
		if (session) {
			session.close().then(() => res.send(JSON.stringify(session.serialize())))
				.catch(err => res.status(400).send(JSON.stringify(err)));
		} else {
			this.logger.log1(`No session found with ID ${req.params.id}`);
			res.status(404).send();
		}
	}
}

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

let sessionManager = new SessionManager();
let session = sessionManager.createSession('localhost:7001', 'test', 'test');
session.on('statusChanged', (status) => {
	logger.log1(`NEW STATUS! ${status}`);
});
// session.on('*', pdu => {
// 	logger.log1(pdu);
// });

// session.connect().then(() => {
// 	session.bind().catch(() => {
// 		logger.log1("AAA");
// 	})
// 		.then(() => {
// 			logger.log1("OK");
// 			session.send("123", "456", "test");
// 			sleep(600 * 1000);
// 		});
// });
let httpServer = new HTTPServer();