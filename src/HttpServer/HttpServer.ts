import Logger from "../Logger";
import SessionManager from "../SessionManager";
import CenterRequestHandler from "./CenterRequestHandler";
import ClientRequestHandler from "./ClientRequestHandler";
import RequestHandler from "./RequestHandler";

const express = require("express");
const bodyParser = require("body-parser");
const compression = require("compression");
const zlib = require("zlib");

const SERVER_PORT: number = Number(process.env.SERVER_PORT) || 80;

export default class HttpServer {
	private readonly clientRequestHandler: RequestHandler;
	private readonly centerRequestHandler: RequestHandler;

	private app: any;
	private server: any;
	private readonly logger: Logger = new Logger(this.constructor.name);

	constructor(clientManager: SessionManager, centerManager: SessionManager) {
		this.clientRequestHandler = new ClientRequestHandler(clientManager);
		this.centerRequestHandler = new CenterRequestHandler(centerManager);

		this.app = express();
		this.app.use(bodyParser.json());

		this.app.use(compression({
			level: 9,
			strategy: zlib.constants.BROTLI_MODE_TEXT,
		}));

		let clientApiPath: string = 'ClientEntity';
		let centerApiPath: string = 'CenterEntity';

		this.app.get(`/api/${clientApiPath}`, this.clientRequestHandler.doGet.bind(this.clientRequestHandler));
		this.app.post(`/api/${clientApiPath}`, this.clientRequestHandler.doPost.bind(this.clientRequestHandler));
		this.app.put(`/api/${clientApiPath}/:id/send`, this.clientRequestHandler.doConfigureSingleJob.bind(this.clientRequestHandler));
		this.app.post(`/api/${clientApiPath}/:id/send/default`, this.clientRequestHandler.doSendSingleJob.bind(this.clientRequestHandler));
		this.app.post(`/api/${clientApiPath}/:id/send`, this.clientRequestHandler.doSend.bind(this.clientRequestHandler));
		this.app.put(`/api/${clientApiPath}/:id/sendMany`, this.clientRequestHandler.doConfigureManyJob.bind(this.clientRequestHandler));
		this.app.post(`/api/${clientApiPath}/:id/sendMany/default`, this.clientRequestHandler.doSendManyJob.bind(this.clientRequestHandler));
		this.app.post(`/api/${clientApiPath}/:id/sendMany`, this.clientRequestHandler.doSendMany.bind(this.clientRequestHandler));
		this.app.delete(`/api/${clientApiPath}/:id/sendMany`, this.clientRequestHandler.doCancelSendMany.bind(this.clientRequestHandler));
		this.app.post(`/api/${clientApiPath}/:id/bind`, this.clientRequestHandler.doBind.bind(this.clientRequestHandler));
		this.app.post(`/api/${clientApiPath}/:id/connect`, this.clientRequestHandler.doConnect.bind(this.clientRequestHandler));
		this.app.delete(`/api/${clientApiPath}/:id/connect`, this.clientRequestHandler.doDisconnect.bind(this.clientRequestHandler));
		this.app.get(`/api/${clientApiPath}/processors`, this.clientRequestHandler.doGetAvailableProcessors.bind(this.clientRequestHandler));
		this.app.get(`/api/${clientApiPath}/:id/processors`, this.clientRequestHandler.doGetAppliedProcessors.bind(this.clientRequestHandler));
		this.app.post(`/api/${clientApiPath}/:id/processors`, this.clientRequestHandler.doAddProcessor.bind(this.clientRequestHandler));
		this.app.delete(`/api/${clientApiPath}/:id/processors`, this.clientRequestHandler.doRemoveProcessor.bind(this.clientRequestHandler));

		this.app.get(`/api/${clientApiPath}/:id`, this.clientRequestHandler.doGetById.bind(this.clientRequestHandler));
		this.app.patch(`/api/${clientApiPath}/:id`, this.clientRequestHandler.doPatch.bind(this.clientRequestHandler));
		this.app.delete(`/api/${clientApiPath}/:id`, this.clientRequestHandler.doDelete.bind(this.clientRequestHandler));

		this.app.get(`/api/${centerApiPath}`, this.centerRequestHandler.doGet.bind(this.centerRequestHandler));
		this.app.post(`/api/${centerApiPath}`, this.centerRequestHandler.doPost.bind(this.centerRequestHandler));
		this.app.put(`/api/${centerApiPath}/:id/send`, this.centerRequestHandler.doConfigureSingleJob.bind(this.centerRequestHandler));
		this.app.post(`/api/${centerApiPath}/:id/send/default`, this.centerRequestHandler.doSendSingleJob.bind(this.centerRequestHandler));
		this.app.post(`/api/${centerApiPath}/:id/send`, this.centerRequestHandler.doSend.bind(this.centerRequestHandler));
		this.app.put(`/api/${centerApiPath}/:id/sendMany`, this.centerRequestHandler.doConfigureManyJob.bind(this.centerRequestHandler));
		this.app.post(`/api/${centerApiPath}/:id/sendMany/default`, this.centerRequestHandler.doSendManyJob.bind(this.centerRequestHandler));
		this.app.post(`/api/${centerApiPath}/:id/sendMany`, this.centerRequestHandler.doSendMany.bind(this.centerRequestHandler));
		this.app.delete(`/api/${centerApiPath}/:id/sendMany`, this.centerRequestHandler.doCancelSendMany.bind(this.centerRequestHandler));
		this.app.delete(`/api/${centerApiPath}/:id/connect`, this.centerRequestHandler.doDisconnect.bind(this.centerRequestHandler));
		this.app.get(`/api/${centerApiPath}/processors`, this.centerRequestHandler.doGetAvailableProcessors.bind(this.centerRequestHandler));
		this.app.get(`/api/${centerApiPath}/:id/processors`, this.centerRequestHandler.doGetAppliedProcessors.bind(this.centerRequestHandler));
		this.app.post(`/api/${centerApiPath}/:id/processors`, this.centerRequestHandler.doAddProcessor.bind(this.centerRequestHandler));
		this.app.delete(`/api/${centerApiPath}/:id/processors`, this.centerRequestHandler.doRemoveProcessor.bind(this.centerRequestHandler));

		this.app.get(`/api/${centerApiPath}/:id`, this.centerRequestHandler.doGetById.bind(this.centerRequestHandler));
		this.app.patch(`/api/${centerApiPath}/:id`, this.centerRequestHandler.doPatch.bind(this.centerRequestHandler));
		this.app.delete(`/api/${centerApiPath}/:id`, this.centerRequestHandler.doDelete.bind(this.centerRequestHandler));

		this.app.get('/api/ping', function (req: any, res: any) {
			res.send('pong');
		});

		this.server = this.app.listen(SERVER_PORT, function () {
			// @ts-ignore
			this.logger.log1(`HTTPServer listening at http://localhost:${SERVER_PORT}`)
		}.bind(this));
	}
}