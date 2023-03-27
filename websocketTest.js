const WebSocket = require('ws');

const WS_SERVER_PORT = process.env.WS_SERVER_PORT || 8191;

class Metrics {
	static interestingMetrics = [
		'submit_sm',
		'deliver_sm'
	];
	metrics = {};

	constructor() {
	}

	processPdu(pdu) {
		if (Metrics.interestingMetrics.indexOf(pdu.command) !== -1) {
			let timestamp = Math.floor(new Date().getTime() / 1000);

			if (!!!this.metrics[timestamp]) {
				this.metrics[timestamp] = {};
			}
			if (!!!this.metrics[timestamp][pdu.command]) {
				this.metrics[timestamp][pdu.command] = 0;
			}

			this.metrics[timestamp][pdu.command] += 1;
		}
	}
}

let clientMetrics = new Metrics();
let centerMetrics = new Metrics();

const ws = new WebSocket(`ws://localhost:${WS_SERVER_PORT}`);
ws.on('open', () => {
	console.log('WebSocket connection established');
	ws.send("client:1");
});
ws.on('message', (data) => {
	data = JSON.parse(data);
	console.log(data);
});

const ws2 = new WebSocket(`ws://localhost:${WS_SERVER_PORT}`);
ws2.on('open', () => {
	console.log('WebSocket connection established');
	ws2.send("center:0");
});
ws2.on('message', (data) => {
	data = JSON.parse(data);
	console.log(data);
	// if (data.type === 'pdu') {
	// 	centerMetrics.processPdu(data.value);
	// }
});

// setInterval(() => {
// 	console.log(clientMetrics.metrics);
// 	// console.log(centerMetrics.metrics);
// 	console.log("");
// }, 500);