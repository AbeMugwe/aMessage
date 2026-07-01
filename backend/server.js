const express = require('express');
const cors = require('cors');
const crypto = require('./cryptoCore');

const app = express();
app.use(cors());
app.use(express.json());

const sessions = new Map();

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

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Secure-chat backend running on http://localhost:${PORT}`);
});