const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = {};

wss.on('connection', (ws) => {
	ws.on('message', (message) => {
		let msg;

		try {
			msg = JSON.parse(message);
		} catch (e) {
			console.error('Invalid JSON:', e);
			return;
		}

		const { type } = msg;

		if (type === 'join') {
			const room = msg.room;
			ws.room = room;
			rooms[room] = rooms[room] || [];

			console.log('rooms ->', rooms);

			if (rooms[room].length >= 2) {
				ws.send(JSON.stringify({ type: 'full' }));
				return;
			}

			rooms[room].push(ws);

			console.log('rooms 2 ->', rooms);

			const othersCount = rooms[room].length - 1;
			ws.send(JSON.stringify({ type: 'joined', othersCount }));

			rooms[room].forEach((client) => {
				console.log('client ->', client);
				if (client !== ws && client.readyState === WebSocket.OPEN) {
					client.send(JSON.stringify({ type: 'peer-joined' }));
				} else if (type === 'offer' || type === 'answer' || type === 'ice') {
					const room = ws.room;
					if (!room || !rooms[room]) return;
					rooms[room].forEach((client) => {
						if (client !== ws && client.readyState === WebSocket.OPEN) {
							client.send(JSON.stringify({ type, data: msg.data }));
						}
					});
				} else if (type === 'leave') {
					const room = ws.room;
					if (room && rooms[room]) {
						rooms[room] = rooms[room].filter((s) => s !== ws);
						rooms[room].forEach((client) => {
							if (client.readyState === WebSocket.OPEN)
								client.send(JSON.stringify({ type: 'peer-left' }));
						});
						if (rooms[room].length === 0) delete rooms[room];
					}
				}
			});
		}
	});

	ws.on('close', () => {
		const room = ws.room;
		if (!room || !rooms[room]) return;

		rooms[room] = rooms[room].filter((s) => s !== ws);
		rooms[room].forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify({ type: 'peer-left' }));
			}
		});
		if (rooms[room].length === 0) delete rooms[room];
	});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Servidor rodando na porta 3000'));
