const WebSocket = require('ws');

const WS_SERVER_PORT = process.env.WS_SERVER_PORT || 8191;

const ws = new WebSocket(`ws://localhost:${WS_SERVER_PORT}`);
ws.on('open', () => {
	console.log('WebSocket connection established');
	ws.send(3);
});
ws.on('message', (data) => {
	console.log(data);
});