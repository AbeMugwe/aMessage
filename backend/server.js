const express = require('express');
const cors = require('cors');
const crypto = require('./cryptoCore');

const app = express();
app.use(cors());
app.use(express.json());

const sessions = new Map();
const globalMode = { encMode: true, authMode: true };
const outbox = [];
let outboxCounter = 0;

function getOrCreateSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {});
  }
  return sessions.get(userId);
}

app.post('/api/session/init', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const session = getOrCreateSession(userId);

  const { ecdh, publicKeyBase64 } = crypto.generateECDHKeyPair();
  const { publicKey, privateKey } = crypto.generateSigningKeyPair();

  session.ecdh = ecdh;
  session.ecdhPublicKey = publicKeyBase64;
  session.signingPrivateKey = privateKey;
  session.signingPublicKey = publicKey;
  session.sharedKey = null;

  res.json({
    userId,
    ecdhPublicKey: publicKeyBase64,
    signingPublicKey: publicKey,
  });
});

app.post('/api/session/exchange', (req, res) => {
  const { userId, peerEcdhPublicKey } = req.body;
  const session = sessions.get(userId);

  if (!session || !session.ecdh) {
    return res.status(400).json({ error: 'Call /api/session/init first' });
  }
  if (!peerEcdhPublicKey) {
    return res.status(400).json({ error: 'peerEcdhPublicKey is required' });
  }

  session.sharedKey = crypto.deriveSharedKey(session.ecdh, peerEcdhPublicKey);

  res.json({
    userId,
    status: 'key_exchanged',
    keyFingerprint: session.sharedKey.toString('hex').slice(0, 16),
  });
});

app.post('/api/message/send', (req, res) => {
  const { userId, message } = req.body;
  const session = sessions.get(userId);

  if (!session || !session.sharedKey) {
    return res.status(400).json({ error: 'Complete key exchange first' });
  }
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const signature = crypto.signMessage(message, session.signingPrivateKey);
  const encrypted = crypto.encryptMessage(message, session.sharedKey);

  res.json({
    userId,
    ...encrypted,
    signature,
    signingPublicKey: session.signingPublicKey,
  });
});

app.post('/api/message/receive', (req, res) => {
  const { userId, ciphertext, iv, authTag, signature, signingPublicKey } = req.body;
  const session = sessions.get(userId);

  if (!session || !session.sharedKey) {
    return res.status(400).json({ error: 'Complete key exchange first' });
  }
  if (!ciphertext || !iv || !authTag) {
    return res.status(400).json({ error: 'ciphertext, iv, authTag are required' });
  }

  let plaintext;
  try {
    plaintext = crypto.decryptMessage({ ciphertext, iv, authTag }, session.sharedKey);
  } catch (err) {
    return res.status(400).json({ error: 'Decryption failed — wrong key or tampered data' });
  }

  let authenticated = false;
  if (signature && signingPublicKey) {
    authenticated = crypto.verifySignature(plaintext, signature, signingPublicKey);
  }

  res.json({
    userId,
    plaintext,
    authenticated,
  });
});

app.get('/api/session/info', (req, res) => {
  const { userId } = req.query;
  const session = sessions.get(userId);
  if (!session || !session.ecdhPublicKey) {
    return res.status(404).json({ error: 'Session not found or not initialised' });
  }
  res.json({
    userId,
    ecdhPublicKey: session.ecdhPublicKey,
    signingPublicKey: session.signingPublicKey,
  });
});

app.post('/api/message/send-plain', (req, res) => {
  const { userId, message } = req.body;
  const session = sessions.get(userId);
  if (!session) return res.status(400).json({ error: 'Call /api/session/init first' });
  if (!message) return res.status(400).json({ error: 'message is required' });

  const signature = globalMode.authMode
    ? crypto.signMessage(message, session.signingPrivateKey)
    : null;

  res.json({
    userId,
    plaintext: message,
    signature,
    signingPublicKey: session.signingPublicKey,
  });
});

app.post('/api/outbox/push', (req, res) => {
  const { from, to, packet } = req.body;
  if (!from || !to || !packet) {
    return res.status(400).json({ error: 'from, to, and packet are required' });
  }
  outboxCounter++;
  outbox.push({ id: outboxCounter, from, to, packet, fromEve: false, ts: Date.now() });
  res.json({ ok: true, id: outboxCounter });
});

app.get('/api/outbox/pull', (req, res) => {
  const { to, after = 0 } = req.query;
  const messages = outbox.filter(m => m.to === to && m.id > parseInt(after));
  res.json({ messages });
});

app.get('/api/outbox/all', (req, res) => {
  const { after = 0 } = req.query;
  const messages = outbox.filter(m => m.id > parseInt(after));
  res.json({ messages });
});

app.post('/api/eve/intercept', (req, res) => {
  const packet = req.body;
  const visible = packet.ciphertext
    ? packet.ciphertext
    : (packet.plaintext || packet.message || '');
  res.json({ visible });
});

app.post('/api/eve/spoof', (req, res) => {
  const { spoofAs, targetUserId, message } = req.body;
  if (!spoofAs || !targetUserId || !message) {
    return res.status(400).json({ error: 'spoofAs, targetUserId, and message are required' });
  }
  outboxCounter++;
  outbox.push({
    id: outboxCounter,
    from: spoofAs,
    to: targetUserId,
    packet: {
      plaintext: message,
      signature: 'FAKE_SIGNATURE',
      signingPublicKey: null,
    },
    fromEve: true,
    ts: Date.now(),
  });
  res.json({ ok: true, id: outboxCounter });
});

app.get('/api/session/mode', (req, res) => {
  res.json(globalMode);
});

app.post('/api/session/mode', (req, res) => {
  const { encMode, authMode } = req.body;
  if (typeof encMode === 'boolean') globalMode.encMode = encMode;
  if (typeof authMode === 'boolean') globalMode.authMode = authMode;
  res.json(globalMode);
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Secure-chat backend running on http://localhost:${PORT}`);
});