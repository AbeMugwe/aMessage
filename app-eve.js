// app-eve.js
// Eve's page. She controls the enc/auth toggles, intercepts traffic,
// and can spoof messages as either Alice or Bob.

let encMode = true;
let authMode = true;
let lastMsgId = 0;

const chatEl  = document.getElementById('chat');
const inputEl = document.getElementById('msg-input');

function now() { return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }

function addBubble(html, cls, time) {
  const d = document.createElement('div');
  d.className = 'bubble ' + cls;
  d.innerHTML = `<div>${html}</div><div class="bubble-time">${time || now()}</div>`;
  chatEl.appendChild(d);
  requestAnimationFrame(() => d.classList.add('show'));
  chatEl.scrollTop = chatEl.scrollHeight;
}

function flyPacket(label, cls) {
  return new Promise(resolve => {
    const rect  = document.body.getBoundingClientRect();
    const fromX = rect.width * 0.1;
    const toX   = rect.width * 0.9;
    const y     = rect.height * 0.5;

    const pkt = document.createElement('div');
    pkt.className = 'packet ' + cls;
    pkt.textContent = label;
    pkt.style.left = fromX + 'px';
    pkt.style.top  = y + 'px';
    pkt.style.opacity = '0';
    document.body.appendChild(pkt);

    const dur = 700;
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

// ── Toggle enc/auth mode — pushes to backend so Alice + Bob see it too ──
async function toggleMode(key) {
  if (key === 'enc') encMode = !encMode;
  else authMode = !authMode;

  // Update pill UI
  const pill  = document.getElementById('pill-' + key);
  const label = document.getElementById('label-' + key);
  pill.className = 'toggle-pill ' + (key === 'enc' ? (encMode ? 'on' : 'off') : (authMode ? 'on' : 'off'));

  if (key === 'enc') {
    label.textContent = encMode ? 'Encryption ON' : 'Encryption OFF';
    const tag = document.getElementById('tag-enc');
    tag.textContent = encMode ? '🔒 AES-256 ON' : '🔓 Encryption OFF';
    tag.className = 'tag ' + (encMode ? 'tag-enc-on' : 'tag-enc-off');
  } else {
    label.textContent = authMode ? 'Auth ON' : 'Auth OFF';
    const tag = document.getElementById('tag-auth');
    tag.textContent = authMode ? '✓ Auth ON' : '✗ Auth OFF';
    tag.className = 'tag ' + (authMode ? 'tag-auth-on' : 'tag-auth-off');
  }

  // Push to backend
  await API.setMode(encMode, authMode);
  addBubble(
    `Mode changed → Encryption: ${encMode ? 'ON' : 'OFF'} · Auth: ${authMode ? 'ON' : 'OFF'}`,
    'bubble-system'
  );
}

// ── Eve sends her own standalone message (not a spoof) ──
function eveSendOwn() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  addBubble('(own) ' + text, 'bubble-eve-out');
}

// ── Eve spoofs a message as Alice or Bob ──
async function eveSpoof(spoofAs) {
  const text = inputEl.value.trim();
  if (!text) {
    inputEl.placeholder = 'Type a message to spoof first…';
    return;
  }
  inputEl.value = '';
  inputEl.placeholder = 'Eve\'s message to spoof…';

  const target = spoofAs === 'alice' ? 'bob' : 'alice';
  const pretending = spoofAs === 'alice' ? 'Alice' : 'Bob';

  addBubble(`Spoofing as ${pretending} → sending to ${target}: "${text}"`, 'bubble-eve-out');

  // Animate spoof packet flying
  await flyPacket(`⚡ Spoof as ${pretending}: ${text}`, 'packet-spoof');

  // Tell backend — it stores this in Bob/Alice's inbox flagged as fromEve
  const result = await API.eveSpoof(spoofAs, target, text);

  if (authMode) {
    addBubble(`${target} rejected the spoof — signature mismatch detected.`, 'bubble-system');
  } else {
    addBubble(`${target} received spoof as ${pretending} with no warning (auth is OFF).`, 'bubble-system');
  }
}

// ── Poll outbox to show Eve what's flying through the channel ──
async function pollIntercept() {
  try {
    const res = await fetch(`http://localhost:3001/api/outbox/all?after=${lastMsgId}`);
    if (!res.ok) return;
    const { messages } = await res.json();
    for (const msg of messages) {
      lastMsgId = Math.max(lastMsgId, msg.id);
      if (msg.fromEve) continue; // don't echo Eve's own spoofs back to her

      const intercept = await API.eveIntercept(msg.packet);

      if (encMode) {
        addBubble(
          `Intercepted (${msg.from} → ${msg.to}): <span style="font-family:monospace;font-size:11px">${intercept.visible.slice(0,40)}…</span>`,
          'bubble-intercepted-cipher',
          `${now()} · encrypted`
        );
      } else {
        addBubble(
          `Intercepted (${msg.from} → ${msg.to}): "${intercept.visible}"`,
          'bubble-intercepted-plain',
          `${now()} · PLAINTEXT`
        );
      }
    }
  } catch(_) {}
}

// Start polling
setInterval(pollIntercept, 2000);
addBubble('Eve is ready. Intercepting all traffic…', 'bubble-system');