// app-bob.js — mirrors app-alice.js with roles swapped

const USER_ID = 'bob';
const PEER_ID = 'alice';

let session   = {};
let busy      = false;
let lastMsgId = 0;

const chatEl    = document.getElementById('chat');
const statusEl  = document.getElementById('status');
const subEl     = document.getElementById('sub');
const statusBar = document.getElementById('status-bar');
const inputEl   = document.getElementById('msg-input');
const sendBtn   = document.getElementById('send-btn');
const banner    = document.getElementById('mode-banner');

function now() { return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }

function addBubble(html, cls, time) {
  const d = document.createElement('div');
  d.className = 'bubble ' + cls;
  d.innerHTML = `<div>${html}</div><div class="bubble-time">${time || now()}</div>`;
  chatEl.appendChild(d);
  requestAnimationFrame(() => d.classList.add('show'));
  chatEl.scrollTop = chatEl.scrollHeight;
}

function setStatusBar(enc, auth) {
  statusBar.innerHTML = `
    <span class="tag tag-key">🔑 Key exchanged</span>
    <span class="tag ${enc ? 'tag-enc-on' : 'tag-enc-off'}">${enc ? '🔒 AES-256 ON' : '🔓 Encryption OFF'}</span>
    <span class="tag ${auth ? 'tag-auth-on' : 'tag-auth-off'}">${auth ? '✓ Auth ON' : '✗ Auth OFF'}</span>
  `;
}

function flyPacket(label, isEnc) {
  return new Promise(resolve => {
    const rect  = document.body.getBoundingClientRect();
    const fromX = rect.width * 0.8;
    const toX   = rect.width * 0.2;
    const y     = rect.height * 0.5;

    const pkt = document.createElement('div');
    pkt.className = 'packet ' + (isEnc ? 'packet-enc' : 'packet-plain');
    pkt.textContent = (isEnc ? '🔒 ' : '⚠ ') + label;
    pkt.style.left = fromX + 'px';
    pkt.style.top  = y + 'px';
    pkt.style.opacity = '0';
    document.body.appendChild(pkt);

    const dur = 650;
    let start = null;
    function step(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const e = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;
      pkt.style.left = (fromX + (toX - fromX) * e) + 'px';
      pkt.style.opacity = p < 0.12 ? p/0.12 : p > 0.88 ? (1-p)/0.12 : '1';
      if (p < 1) requestAnimationFrame(step);
      else { pkt.remove(); resolve(); }
    }
    requestAnimationFrame(step);
  });
}

async function init() {
  statusEl.textContent = 'Initialising session…';
  try {
    session = await API.initSession(USER_ID);

    statusEl.textContent = 'Waiting for Alice to connect…';
    let aliceSession = null;
    while (!aliceSession || !aliceSession.ecdhPublicKey) {
      await new Promise(r => setTimeout(r, 1000));
      const res = await fetch(`http://localhost:3001/api/session/info?userId=${PEER_ID}`);
      if (res.ok) aliceSession = await res.json();
    }

    await API.exchangeKeys(USER_ID, aliceSession.ecdhPublicKey);
    session.peerSigningPublicKey = aliceSession.signingPublicKey;

    statusEl.textContent = '✅ Secure channel ready';
    subEl.textContent = 'Secure · Online';
    addBubble('Key exchange complete. Talking to Alice.', 'bubble-system');

    inputEl.disabled = false;
    sendBtn.disabled = false;

    setInterval(pollMessages, 2000);
    setInterval(pollMode, 2000);
    pollMode();

  } catch (err) {
    statusEl.textContent = '❌ Connection failed — is the backend running?';
    console.error(err);
  }
}

async function sendMessage() {
  if (busy) return;
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  busy = true;
  sendBtn.disabled = true;

  addBubble(text, 'bubble-out-bob');

  const { encMode } = await API.getMode();
  let packet;
  if (encMode) {
    packet = await API.sendMessage(USER_ID, text);
    await flyPacket(packet.ciphertext.slice(0, 24), true);
  } else {
    packet = await API.sendPlain(USER_ID, text);
    await flyPacket(text, false);
  }

  await fetch('http://localhost:3001/api/outbox/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: USER_ID, to: PEER_ID, packet }),
  });

  busy = false;
  sendBtn.disabled = false;
}

async function pollMessages() {
  try {
    const res = await fetch(`http://localhost:3001/api/outbox/pull?to=${USER_ID}&after=${lastMsgId}`);
    if (!res.ok) return;
    const { messages } = await res.json();
    for (const msg of messages) {
      lastMsgId = Math.max(lastMsgId, msg.id);

      // Check if this was a spoof attempt from Eve
      if (msg.fromEve) {
        const { authMode } = await API.getMode();
        if (authMode) {
          addBubble('⚠️ Rejected — signature mismatch. This was not from Alice.', 'bubble-warn');
        } else {
          addBubble(msg.packet.plaintext, 'bubble-in-alice', `${now()} · Alice (unverified)`);
        }
        continue;
      }

      const { encMode } = await API.getMode();
      if (encMode && msg.packet.ciphertext) {
        const result = await API.receiveMessage(USER_ID, {
          ...msg.packet,
          signingPublicKey: session.peerSigningPublicKey,
        });
        const label = result.authenticated ? 'Alice · verified ✓' : 'Alice · unverified';
        addBubble(result.plaintext, 'bubble-in-alice', `${now()} · ${label}`);
      } else {
        addBubble(msg.packet.plaintext || msg.packet.message, 'bubble-in-alice');
      }
    }
  } catch(_) {}
}

async function pollMode() {
  try {
    const { encMode, authMode } = await API.getMode();
    banner.textContent = (encMode ? '🔒 Encryption ON' : '🔓 Encryption OFF') + ' · ' + (authMode ? '✓ Auth ON' : '✗ Auth OFF');
    banner.className = 'mode-banner ' + (encMode ? 'enc-on' : 'enc-off');
    setStatusBar(encMode, authMode);
  } catch(_) {}
}

sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

init();