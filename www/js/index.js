'use strict';

document.title = config.title;

let ws = null;
const connect = () => {
	let connection = `ws://${location.hostname}:`;
	if (config.port !== undefined) {
		connection += config.port;
	}
	else {
		connection = config.ws;
	}
	if (navigator.onLine) {
		ws = new WebSocket(connection);

		ws.addEventListener('open', function (e) {
			console.log('open', e);
			if (pingTimeout !== null) {
				clearTimeout(pingTimeout);
				pingTimeout = null;
			}
		});
		ws.addEventListener('message', function (e) {
			let message = JSON.parse(e.data);
			if (message.type === 'ping') {
				heartbeat();
				return false;
			}

			if (message.hour !== undefined) {
				document.querySelector('.m').textContent = Math.round(message.hour);
				document.querySelector('.s').textContent = Math.round(message.fivemin);
				document.querySelector('.t').textContent = Math.round(message.current);

				let c = 'red';
				if (message.hour < config.watt.orange) {
					c = 'orange';
				}
				if (message.hour < config.watt.yellow) {
					c = 'yellow';
				}
				if (message.hour < config.watt.green) {
					c = 'green';
				}
				let r = 240 * (message.hour / config.watt.peak);
				if (r > 240) {
					r = 240;
				}
				document.querySelector('.c').style.background = `conic-gradient(${c} ${r}deg, #0002 0 240deg, #222 0)`;

				c = 'red';
				if (message.fivemin < config.watt.orange) {
					c = 'orange';
				}
				if (message.fivemin < config.watt.yellow) {
					c = 'yellow';
				}
				if (message.fivemin < config.watt.green) {
					c = 'green';
				}
				r = 240 * (message.fivemin / config.watt.peak);
				if (r > 240) {
					r = 240;
				}
				document.querySelector('.f').style.background = `conic-gradient(${c} ${r}deg, #0002 0 240deg, #222 0)`;

				c = 'red';
				if (message.current < config.watt.orange) {
					c = 'orange';
				}
				if (message.current < config.watt.yellow) {
					c = 'yellow';
				}
				if (message.current < config.watt.green) {
					c = 'green';
				}
				r = 240 * (message.current / config.watt.peak);
				if (r > 240) {
					r = 240;
				}
				document.querySelector('.h').style.background = `conic-gradient(${c} ${r}deg, #0002 0 240deg, #222 0)`;
			}
		});
		ws.addEventListener('error', function (e) {
			console.log('error', e, e.code);
			offline();
		});
		ws.addEventListener('close', function (e) {
			console.log('close');
			offline();
			if (pingTimeout !== null) {
				clearTimeout(pingTimeout);
				pingTimeout = null;
			}
			setTimeout(() => {
				connect();
			}, 1000);
		});
	}
	else {
		offline();
		if (pingTimeout !== null) {
			clearTimeout(pingTimeout);
			pingTimeout = null;
		}
		setTimeout(() => {
			connect();
		}, 1000);
	}
};

const offline = () => {
	document.querySelector('.m').textContent = '…';
	document.querySelector('.s').textContent = '';
	document.querySelector('.t').textContent = '';
	document.querySelector('.c').style.background = `conic-gradient(#0002 0 240deg, #222 0)`;
	document.querySelector('.f').style.background = `conic-gradient(#0002 0 240deg, #222 0)`;
	document.querySelector('.h').style.background = `conic-gradient(#0002 0 240deg, #222 0)`;
};

document.addEventListener('DOMContentLoaded', () => {
	connect();
	document.querySelector('h1').textContent = config.title;
});

let pingTimeout = null;

const heartbeat = () => {
	ws.send(JSON.stringify({
		'type': 'pong'
	}));
	clearTimeout(pingTimeout);
	pingTimeout = setTimeout(() => {
		console.log('hb timeout');
		ws.close();
	}, 30000 + 5000);
};

window.addEventListener('offline', () => {
	offline();
	ws.close(4000, 'offline');
});
