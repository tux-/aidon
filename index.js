'use strict'

const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const EventEmitter = require('events');
const ini = require('ini');
const clc = require("cli-color");

if (!fs.existsSync('./config.ini')) {
	console.log(clc.yellow("\nPlease copy config.example.ini to config.ini and set your settings first.\n"));
	process.exit();
}

const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));

const event = new EventEmitter();

let cconnections = 0;

const client  = mqtt.connect(config.mqtt.read);

client.on('connect', () => {
	console.log(clc.green('connected to aidon.'));

	client.subscribe(`sensor/aidon`);
});

let median = [];

client.on('message', (topic, message) => {
	if ((message === undefined) || (message === null) || (message.length === 0)) {
		return;
	}
	try {
		const json = JSON.parse(message);
		if (json === null) {
			return;
		}
		if (json.data === undefined) {
			return;
		}
		if (json.data.power_active_import === undefined) {
			return;
		}
		if (json.data.power_active_import.value === undefined) {
			return;
		}


		let hour = new Date();
		let nowmTime = hour.getTime();
		hour.setMilliseconds(0);
		hour.setSeconds(0);
		hour.setMinutes(0);
		let nowmHour = hour.getTime();
		median.unshift({
			mtime: nowmTime,
			watt: json.data.power_active_import.value
		});

		let fivelog = [];
		let hourlog = [];
		let cutoff = null;

		for (let i in median) {
			let fivedel = false;
			if (median[i].mtime + 300000 < nowmTime) {
				fivedel = true;
			}
			else {
				fivelog.push(median[i].watt);
			}

			let hourdel = false;
			if (median[i].mtime < nowmHour) {
				hourdel = true;
			}
			else {
				hourlog.push(median[i].watt);
			}

			if ((cutoff === null) && (fivedel === true) && (hourdel === true)) {
				cutoff = i;
			}
		}

		if (cutoff !== null) {
			median = median.slice(0, cutoff);
		}

		const fivesum = fivelog.reduce((a, b) => a + b, 0);
		const fiveavg = (fivesum / fivelog.length) || 0;

		const hoursum = hourlog.reduce((a, b) => a + b, 0);
		const houravg = (hoursum / hourlog.length) || 0;

		broadcast({
			hour: houravg,
			fivemin: fiveavg,
			current: json.data.power_active_import.value,
		});
	}
	catch (err) {
		console.log(err);
	}
});

client.on('close', () => {
	console.log(clc.yellow('disconnected from aidon mqtt.'));
});
client.on('error', error => {
	console.log('error:');
	console.log(error);
});
client.on('offline', () => {
	console.log('offline.');
});
client.on('end', () => {
	console.log('end.');
});
client.on('reconnect', () => {
	console.log('reconnect to aidon mqtt …');
});

const server = http.createServer((req, res) => {
	let file = req.url;
	if (file === '/') {
		file += 'index.html';
	}
	if (file === '/config.js') {
		res.statusCode = 200;
		res.setHeader('Content-Type', 'text/javascript');
		const json = {
			title: config.title,
			watt: config.watt,
		};
		if (config.proxy !== undefined) {
			json.ws = config.proxy.ws;
		}
		else {
			json.port = config.server.ws_port;
		}
		res.end('const config = ' + JSON.stringify(json) + ';');
		return;
	}
	fs.readFile('www' + file, function (err, filedata) {
		if (err) {
			res.writeHead(404);
			res.end(JSON.stringify(err));
			return;
		}
		res.statusCode = 200;
		if (file.endsWith('.html')) {
			res.setHeader('Content-Type', 'text/html');
		}
		if (file.endsWith('.js')) {
			res.setHeader('Content-Type', 'text/javascript');
		}
		if (file.endsWith('.css')) {
			res.setHeader('Content-Type', 'text/css');
		}
		if (file.endsWith('.png')) {
			res.setHeader('Content-Type', 'image/x-png');
		}
		res.end(filedata);
	});
});

server.listen(parseInt(config.server.www_port), config.server.interface, () => {
	console.log(`Server running on ${config.server.interface}:${config.server.www_port}`);
});

const wss = new WebSocket.Server({
	port: parseInt(config.server.ws_port),
	perMessageDeflate: {
		zlibDeflateOptions: {
			chunkSize: 1024,
			memLevel: 7,
			level: 3,
		},
		zlibInflateOptions: {
			chunkSize: 10 * 1024,
		},
		clientNoContextTakeover: true,
		serverNoContextTakeover: true,
		serverMaxWindowBits: 10,
		concurrencyLimit: 10,
		threshold: 1024,
	}
});

const broadcast = (json) => {
	wss.clients.forEach((ws) => {
		if (ws.isAlive === true) {
			ws.send(JSON.stringify(json));
		}
	});
};

wss.on('connection', function connection(ws, req) {
	ws.isAlive = true;

	cconnections++;
	ws.gid = cconnections;

	ws.send(JSON.stringify({
		'type': 'ready'
	}));

	console.log(`New connection ${ws.gid} ip: ${req.connection.remoteAddress} total: ${wss.clients.size}`);

	ws.on('message', (message) => {
		ws.isAlive = true;
		let json = JSON.parse(message);
		if (json.type === 'pong') {
		}
		else if (json.type === 'ping') {
			ws.send(JSON.stringify({
				'type': 'pong'
			}));
		}
		else if ((json.type === 'message') && (json.data !== undefined)) {
			event.emit('socket', ws, req, json.data);
		}
		else {
			console.log('received:', json);
		}
	});

	event.emit('connection');
});

const wsinterval = setInterval(() => {
	wss.clients.forEach((ws) => {
		if (ws.isAlive === false) {
			console.log(`Terminating connection ${ws.gid}.`);
			return ws.terminate();
		}

		ws.isAlive = false;
		try {
			ws.send(JSON.stringify({
				'type': 'ping'
			}));
		}
		catch (e) {
			console.log(e);
		}
	});
}, 10000);

wss.on('close', () => {
	clearInterval(wsinterval);
});
