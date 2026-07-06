// Eve is purely reactive — she intercepts whatever the channel carries.
// The admin panel controls whether she can read it or spoof successfully.

let lastMsgId   = 0;
let currentMode = { encMode: true, authMode: true };

const chatEl    = document.getElementById('chat');
const inputEl   = document.getElementById('msg-input');
const banner    = document.getElementById('mode-banner');
const statusBar = document.getElementById('status-bar');

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
    pkt.style.left    = fromX + 'px';
    pkt.style.top     = y + 'px';
    pkt.style.opacity = '0';
    document.body.appendChild(pkt);

    const dur = 700;
    let start = null;
    function step(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const e = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;
      pkt.style.left    = (fromX + (toX - fromX) * e) + 'px';
      pkt.style.opacity = p < 0.12 ? p/0.12 : p > 0.88 ? (1-p)/0.12 : '1';
      if (p < 1) requestAnimationFrame(step);
      else { pkt.remove(); resolve(); }
    }
    requestAnimationFrame(step);
  });
}

function updateStatusBar(encMode, authMode) {
  statusBar.innerHTML = `
    <span class="tag ${encMode  ? 'tag-enc-on'  : 'tag-enc-off'}">${encMode  ? '🔒 Enc ON'  : '🔓 Enc OFF — reading plaintext'}</span>
    <span class="tag ${authMode ? 'tag-auth-on' : 'tag-auth-off'}">${authMode ? '✓ Auth ON — spoofs blocked' : '✗ Auth OFF — spoofing works'}</span>
  `;
}

function updateSpoofButtons(authMode) {
  const btnAlice = document.getElementById('spoof-alice');
  const btnBob   = document.getElementById('spoof-bob');
  // When auth is ON, buttons stay enabled but warn — Eve can still attempt,
  // it just gets rejected. This is better for the demo so the lecturer sees the rejection.
  btnAlice.disabled = false;
  btnBob.disabled   = false;
  btnAlice.title = authMode ? 'Auth ON — spoof will be rejected by Bob'   : 'Auth OFF — spoof will succeed';
  btnBob.title   = authMode ? 'Auth ON — spoof will be rejected by Alice' : 'Auth OFF — spoof will succeed';
  btnAlice.style.opacity = '1';
  btnBob.style.opacity   = '1';
}

// Eve sends her own message (not a spoof)
function eveSendOwn() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  addBubble('(own) ' + text, 'bubble-eve-out');
}

// Eve tries to spoof as Alice or Bob
async function eveSpoof(spoofAs) {
  const text = inputEl.value.trim();
  if (!text) {
    inputEl.placeholder = 'Type a message to spoof first…';
    return;
  }
  inputEl.value = '';
  inputEl.placeholder = "Eve's message to spoof…";

  const target     = spoofAs === 'alice' ? 'bob' : 'alice';
  const pretending = spoofAs === 'alice' ? 'Alice' : 'Bob';

  addBubble(`Attempting to spoof as ${pretending} → ${target}: "${text}"`, 'bubble-eve-out');
  await flyPacket(`⚡ Spoof as ${pretending}: ${text}`, 'packet-spoof');

  // Push spoof to backend
  await API.eveSpoof(spoofAs, target, text);

  // FIX 1: Always fetch fresh mode — don't trust the 2s cached value
  const freshMode = await API.getMode();
  currentMode = freshMode;

  if (freshMode.authMode) {
    addBubble(
      `❌ Spoof failed — ${target} rejected it. Authentication is ON so the fake signature was detected.`,
      'bubble-warn',
      now()
    );
  } else {
    addBubble(
      `✅ Spoof delivered to ${target} as ${pretending}. Authentication is OFF — no signature check, no warning shown to ${target}.`,
      'bubble-intercepted-plain',
      now()
    );
  }
}

// Poll all outbox messages — Eve intercepts everything
async function pollIntercept() {
  try {
    const res = await fetch(`http://localhost:3001/api/outbox/all?after=${lastMsgId}`);
    if (!res.ok) return;
    const { messages } = await res.json();

    for (const msg of messages) {
      lastMsgId = Math.max(lastMsgId, msg.id);
      if (msg.fromEve) continue; // don't echo Eve's own spoofs back

      const intercept = await API.eveIntercept(msg.packet);

      // FIX 2: Trust the packet itself to know if it's encrypted —
      // if the packet has a ciphertext field it was encrypted, otherwise it's plain.
      // This avoids the race condition with the 2s mode cache.
      const isEncrypted = !!msg.packet.ciphertext;

      if (isEncrypted) {
        addBubble(
          `Intercepted (${msg.from} → ${msg.to}):<br><span style="font-family:monospace;font-size:11px;opacity:0.8">${intercept.visible.slice(0, 48)}…</span>`,
          'bubble-intercepted-cipher',
          `${now()} · encrypted — cannot read`
        );
      } else {
        addBubble(
          `Intercepted (${msg.from} → ${msg.to}): "${intercept.visible}"`,
          'bubble-intercepted-plain',
          `${now()} · PLAINTEXT — fully visible`
        );
      }
    }
  } catch(_) {}
}

// Poll mode from admin panel
async function pollMode() {
  try {
    const mode = await API.getMode();
    currentMode = mode;
    const { encMode, authMode } = mode;

    banner.textContent = (encMode ? '🔒 Encryption ON' : '🔓 Encryption OFF')
      + ' · ' + (authMode ? '✓ Auth ON' : '✗ Auth OFF');
    banner.className = 'mode-banner ' + (encMode ? 'enc-on' : 'enc-off');
    updateStatusBar(encMode, authMode);
    updateSpoofButtons(authMode);
  } catch(_) {}
}

setInterval(pollIntercept, 2000);
setInterval(pollMode, 2000);

pollMode();
addBubble('Eve is ready. Intercepting all channel traffic…', 'bubble-system');