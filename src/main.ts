import {Center} from "./Center/Center";
import {Client} from "./Client/Client";
import {ClientEvents} from "./Client/ClientEvents";
import ClientSessionManager from "./Client/ClientSessionManager";
import {Job} from "./Job/Job";
import Logger from "./Logger";

const smpp = require("smpp");
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const NanoTimer = require('nanotimer');

const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const {PDU} = require("smpp");

const app = express();

const SERVER_PORT: number = Number(process.env.SERVER_PORT) || 8190;
const WS_SERVER_PORT: number = Number(process.env.WS_SERVER_PORT) || 8191;
const CENTER_SESSIONS_FILE: string = process.env.CENTER_SESSIONS_FILE || "center_sessions.json";

// TODO: Add support for encodings
// TODO: Implement some sort of metrics on frontend by counting the pdus

let logger = new Logger("main");

let clientManager: ClientSessionManager = new ClientSessionManager();
clientManager.setup();

async function main() {
	// let client: Client = await clientManager.createSession("smpp://localhost:7000", "test", "test") as Client;
	let client: Client = await clientManager.getSession(0) as Client;

	// client.connectAndBind().then(() => {
	// 	console.log("POGGIES");
	// 	let pdu1 = new smpp.PDU('submit_sm', {
	// 		source_addr: "1234567890",
	// 		destination_addr: "1234567890",
	// 		short_message: "Hello World"
	// 	});
	// 	// client.sendMultipleDefault();
	//
	// 	// client.on(ClientEvents.ANY_PDU, (pdu: any) => console.log(pdu));
	// 	client.on(ClientEvents.STATUS_CHANGED, (state: any) => console.log(state));
	// 	client.setDefaultSingleJob(new Job(pdu1));
	// 	client.setDefaultMultipleJob(new Job(pdu1, 100, 10));
	// 	client.sendSingleDefault();
	// 	client.close().then(() => {
	// 		console.log("CLOSED");
	// 		client.doConnect().then(() => {
	// 			client.doBind().then(() => {
	// 				client.sendMultipleDefault();
	// 			}, reason => console.log(reason));
	// 		}, err => console.log(err));
	// 	}, err => console.log(err));
	// });

	let center: Center = new Center(0, 7000, "test", "test");
}

main();

function cleanup(): void {
	logger.log1("Cleaning up...");
	clientManager.cleanup();
	process.exit(0);
}

// process.on('exit', cleanup);
// process.on('SIGINT', cleanup);
// process.on('SIGUSR1', cleanup);
// process.on('SIGUSR2', cleanup);