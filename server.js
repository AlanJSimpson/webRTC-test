const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Estrutura para controlar salas
const rooms = {};

// Funções auxiliares
function broadcastToRoom(room, sender, message) {
	if (!rooms[room]) return;
	rooms[room].forEach((client) => {
		if (client !== sender && client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify(message));
		}
	});
}

function removeFromRoom(ws) {
	const room = ws.room;
	if (!room || !rooms[room]) return;

	rooms[room] = rooms[room].filter((s) => s !== ws);

	broadcastToRoom(room, ws, { type: 'peer-left' });

	if (rooms[room].length === 0) delete rooms[room];
}

// Conexão WebSocket
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

		switch (type) {
			case 'join': {
				const room = msg.room;
				ws.room = room;
				rooms[room] = rooms[room] || [];

				if (rooms[room].length >= 2) {
					ws.send(JSON.stringify({ type: 'full' }));
					return;
				}

				rooms[room].push(ws);

				const othersCount = rooms[room].length - 1;
				ws.send(JSON.stringify({ type: 'joined', othersCount }));

				// Avisa os outros da sala
				broadcastToRoom(room, ws, { type: 'peer-joined' });
				break;
			}

			case 'offer':
			case 'answer':
			case 'ice': {
				const room = ws.room;
				broadcastToRoom(room, ws, { type, data: msg.data });
				break;
			}

			case 'leave': {
				removeFromRoom(ws);
				break;
			}
		}
	});

	ws.on('close', () => {
		removeFromRoom(ws);
	});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
