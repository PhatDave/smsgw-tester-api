const WebSocket = require('ws');

const WS_SERVER_PORT = process.env.WS_SERVER_PORT || 8191;

const ws = new WebSocket(`ws://localhost:${WS_SERVER_PORT}`);
const ws2 = new WebSocket(`ws://localhost:${WS_SERVER_PORT}`);
ws.on('open', () => {
	console.log('WebSocket connection established');
	ws.send("client:1");
});
ws.on('message', (data) => {
	console.log(String(data));
});
ws2.on('open', () => {
	console.log('WebSocket connection established');
	ws.send("center:1");
});
ws2.on('message', (data) => {
	console.log(String(data));
});