import CenterSessionManager from "./Center/CenterSessionManager";
import ClientSessionManager from "./Client/ClientSessionManager";
import HttpServer from "./HttpServer/HttpServer";
import Logger from "./Logger";
import ProcessorManager from "./PDUProcessor/ProcessorManager";
import WSServer from "./WS/WSServer";

const {PDU} = require("smpp");

let logger: Logger = new Logger("main");

let pm: ProcessorManager = new ProcessorManager();
let clientManager: ClientSessionManager = new ClientSessionManager();
let centerManager: CenterSessionManager = new CenterSessionManager();

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
