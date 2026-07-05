// api.js — shared by all three pages
// This is the ONLY file that knows the backend URL.
// Change BASE_URL here if your partner's server runs on a different port.
const BASE_URL = 'http://localhost:3001';

const API = {

  // Initialise a user session — generates ECDH + signing key pair on the server
  async initSession(userId) {
    const res = await fetch(`${BASE_URL}/api/session/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return res.json();
    // Returns: { userId, ecdhPublicKey, signingPublicKey }
  },

  // Complete key exchange — give the server your peer's ECDH public key
  async exchangeKeys(userId, peerEcdhPublicKey) {
    const res = await fetch(`${BASE_URL}/api/session/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, peerEcdhPublicKey }),
    });
    return res.json();
    // Returns: { userId, status: 'key_exchanged', keyFingerprint }
  },

  // Send an encrypted + signed message
  async sendMessage(userId, message) {
    const res = await fetch(`${BASE_URL}/api/message/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, message }),
    });
    return res.json();
    // Returns: { ciphertext, iv, authTag, signature, signingPublicKey }
  },

  // Send a plaintext message (encryption OFF mode)
  async sendPlain(userId, message) {
    const res = await fetch(`${BASE_URL}/api/message/send-plain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, message }),
    });
    return res.json();
    // Returns: { plaintext, signature?, signingPublicKey? }
  },

  // Receive + decrypt a message on Bob/Alice's side
  async receiveMessage(userId, packet) {
    const res = await fetch(`${BASE_URL}/api/message/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...packet }),
    });
    return res.json();
    // Returns: { plaintext, authenticated }
  },

  // Eve intercepts a packet mid-flight — backend returns what Eve sees
  async eveIntercept(packet) {
    const res = await fetch(`${BASE_URL}/api/eve/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(packet),
    });
    return res.json();
    // Returns: { visible } — ciphertext (base64) or plaintext depending on enc mode
  },

  // Eve spoofs a message as Alice or Bob — server sends a packet with no real signature
  async eveSpoof(spoofAs, targetUserId, message) {
    const res = await fetch(`${BASE_URL}/api/eve/spoof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spoofAs, targetUserId, message }),
    });
    return res.json();
    // Returns: { plaintext, authenticated: false, rejected: true/false }
  },

  // Get the current global enc/auth mode (set by Eve's toggles)
  async getMode() {
    const res = await fetch(`${BASE_URL}/api/session/mode`);
    return res.json();
    // Returns: { encMode: true/false, authMode: true/false }
  },

  // Set the global enc/auth mode (called by Eve's toggles)
  async setMode(encMode, authMode) {
    const res = await fetch(`${BASE_URL}/api/session/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encMode, authMode }),
    });
    return res.json();
  },

};