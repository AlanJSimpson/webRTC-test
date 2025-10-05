const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');

const ws = new WebSocket(`wss://${location.host}`);
let pc = null;
let localStream = null;

const config = {
	iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

ws.onmessage = async (evt) => {
	const msg = JSON.parse(evt.data);
	console.log('WS message: ', msg);
	switch (msg.type) {
		case 'joined':
			// if there is already someone in the room, we are the newcomer -> create offer
			if (msg.othersCount > 0) {
				await start(true);
			} else {
				await start(false);
			}
			break;
		case 'peer-joined':
			// another peer joined after me; the newcomer will start the offer.
			break;
		case 'offer':
			await handleOffer(msg.data);
			break;
		case 'answer':
			await handleAnswer(msg.data);
			break;
		case 'ice':
			await handleRemoteICE(msg.data);
			break;
		case 'full':
			alert('Sala cheia (apenas 2 participantes suportados neste MVP).');
			break;
		case 'peer-left':
			endCall();
			break;
	}
};

joinBtn.onclick = () => {
	const room = roomInput.value.trim();
	if (!room) return alert('Digite um nome de Sala');
	ws.send(JSON.stringify({ type: 'join', room }));
};

async function start(shouldCreateOffer) {
	await initMedia();
	createPeerConnection();
	if (shouldCreateOffer) {
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		ws.send(JSON.stringify({ type: 'offer', data: offer }));
	}
}

async function initMedia() {
	if (localStream) return;
	try {
		localStream = await navigator.mediaDevices.getUserMedia({
			video: true,
			audio: true,
		});
		localVideo.srcObject = localStream;
	} catch (e) {
		alert('Erro ao acessar câmera/microfone: ' + e.message);
		throw e;
	}
}

function createPeerConnection() {
	if (pc) return;
	pc = new RTCPeerConnection(config);

	pc.onicecandidate = (event) => {
		if (event.candidate) {
			ws.send(JSON.stringify({ type: 'ice', data: event.candidate }));
		}
	};

	pc.ontrack = (event) => {
		remoteVideo.srcObject = event.streams[0];
	};

	localStream.getTracks().forEach((track) => {
		pc.addTrack(track, localStream);
	});
}

async function handleOffer(offer) {
	if (!pc) createPeerConnection();
	await pc.setRemoteDescription(new RTCSessionDescription(offer));
	const answer = await pc.createAnswer();
	await pc.setLocalDescription(answer);
	ws.send(JSON.stringify({ type: 'answer', data: answer }));
}

async function handleAnswer(answer) {
	await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleRemoteICE(candidate) {
	try {
		await pc.addIceCandidate(new RTCIceCandidate(candidate));
	} catch (e) {
		console.error('Failed to add ICE Candidate', e);
	}
}

function endCall() {
	if (pc) {
		pc.close();
		pc = null;
	}
	if (remoteVideo.srcObject) {
		remoteVideo.srcObject.getTracks().forEach((t) => t.stop());
		remoteVideo.srcObject = null;
	}
}

// cleanup on unload
window.addEventListener('beforeunload', () => {
	try {
		ws.send(JSON.stringify({ type: 'leave' }));
	} catch (e) {}
	ws.close();
});
