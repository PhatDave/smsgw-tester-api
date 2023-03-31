import {CenterSessionManager} from "./Center/CenterSessionManager";
import ClientSessionManager from "./Client/ClientSessionManager";
import {HttpServer} from "./HttpServer/HttpServer";
import Logger from "./Logger";
import {DebugPduProcessor} from "./PDUProcessor/DebugPduProcessor";
import {EchoPduProcessor} from "./PDUProcessor/EchoPduProcessor";
import {PduProcessor} from "./PDUProcessor/PduProcessor";
import {WSServer} from "./WS/WSServer";

const {PDU} = require("smpp");

let logger = new Logger("main");

PduProcessor.addProcessor(DebugPduProcessor);
PduProcessor.addProcessor(EchoPduProcessor);

let clientManager: ClientSessionManager = new ClientSessionManager();
let centerManager: CenterSessionManager = new CenterSessionManager();
// TODO: Add support for encodings
// TODO: Fix reading and writing processors
// TODO: Try creating multiple entries with the same arg
let wss: WSServer = new WSServer([clientManager, centerManager]);
let httpServer: HttpServer = new HttpServer(clientManager, centerManager);

function cleanup(): void {
	logger.log1("Cleaning up...");
	clientManager.cleanup();
	centerManager.cleanup();
	process.exit(0);
}

process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGUSR1', cleanup);
process.on('SIGUSR2', cleanup);