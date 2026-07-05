// app-admin.js
// Admin panel — controls the global enc/auth mode for the channel.
// Alice, Bob, and Eve all reflect whatever is set here.

let currentMode = { encMode: true, authMode: true };

const statusEl  = document.getElementById('status');
const summaryEl = document.getElementById('status-summary');

function updateUI(encMode, authMode) {
  // Enc pill
  const encPill  = document.getElementById('pill-enc');
  const encLabel = document.getElementById('label-enc');
  encPill.className  = 'toggle-pill ' + (encMode ? 'on' : 'off');
  encLabel.textContent = encMode ? 'ON' : 'OFF';

  // Auth pill
  const authPill  = document.getElementById('pill-auth');
  const authLabel = document.getElementById('label-auth');
  authPill.className   = 'toggle-pill ' + (authMode ? 'on' : 'off');
  authLabel.textContent = authMode ? 'ON' : 'OFF';

  // Status summary
  const card = document.getElementById('status-card');
  const rows = [
    {
      icon: encMode ? '🔒' : '🔓',
      label: 'Encryption',
      value: encMode ? 'ON — messages are AES-256 encrypted in transit' : 'OFF — messages travel as plaintext',
      good: encMode,
    },
    {
      icon: authMode ? '✓' : '✗',
      label: 'Authentication',
      value: authMode ? 'ON — every message is signed and verified' : 'OFF — anyone can impersonate Alice or Bob',
      good: authMode,
    },
    {
      icon: encMode && authMode ? '🛡️' : '⚠️',
      label: 'Eve can…',
      value: buildEveStatus(encMode, authMode),
      good: encMode && authMode,
    },
  ];

  summaryEl.innerHTML = rows.map(r => `
    <div class="status-row">
      <span class="status-icon">${r.icon}</span>
      <div>
        <div class="status-row-label">${r.label}</div>
        <div class="status-row-value ${r.good ? 'value-good' : 'value-bad'}">${r.value}</div>
      </div>
    </div>
  `).join('');

  card.style.borderColor = (encMode && authMode) ? '#1D9E75' : '#D85A30';
}

function buildEveStatus(enc, auth) {
  if (!enc && !auth) return 'Read all messages in plaintext AND impersonate Alice or Bob freely';
  if (!enc && auth)  return 'Read all messages in plaintext, but cannot impersonate (signatures block her)';
  if (enc && !auth)  return 'Not read messages (encrypted), but CAN impersonate Alice or Bob';
  return 'Do nothing — messages are encrypted and authenticated';
}

async function toggleMode(key) {
  if (key === 'enc')  currentMode.encMode  = !currentMode.encMode;
  else                currentMode.authMode = !currentMode.authMode;

  await API.setMode(currentMode.encMode, currentMode.authMode);
  updateUI(currentMode.encMode, currentMode.authMode);
}

async function applyScenario(enc, auth) {
  currentMode = { encMode: enc, authMode: auth };
  await API.setMode(enc, auth);
  updateUI(enc, auth);
}

async function init() {
  try {
    const mode = await API.getMode();
    currentMode = mode;
    updateUI(mode.encMode, mode.authMode);
    statusEl.textContent = '✅ Connected to backend';
  } catch(err) {
    statusEl.textContent = '❌ Cannot reach backend';
  }
}

init();