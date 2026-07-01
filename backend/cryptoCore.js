const crypto = require('crypto');

const CURVE = 'prime256v1';
const AES_ALGO = 'aes-256-gcm';

function generateECDHKeyPair() {
  const ecdh = crypto.createECDH(CURVE);
  ecdh.generateKeys();
  return {
    ecdh,
    publicKeyBase64: ecdh.getPublicKey('base64'),
  };
}

function deriveSharedKey(ecdh, peerPublicKeyBase64) {
  const peerPublicKey = Buffer.from(peerPublicKeyBase64, 'base64');
  const rawSecret = ecdh.computeSecret(peerPublicKey);

  const aesKey = crypto.hkdfSync(
    'sha256',
    rawSecret,
    Buffer.alloc(0),
    Buffer.from('secure-chat-aes-key'),
    32
  );

  return Buffer.from(aesKey);
}

function generateSigningKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: CURVE,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function signMessage(message, privateKeyPem) {
  const signer = crypto.createSign('SHA256');
  signer.update(message);
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

function verifySignature(message, signatureBase64, publicKeyPem) {
  const verifier = crypto.createVerify('SHA256');
  verifier.update(message);
  verifier.end();
  try {
    return verifier.verify(publicKeyPem, signatureBase64, 'base64');
  } catch (err) {
    return false;
  }
}

function encryptMessage(plaintext, aesKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(AES_ALGO, aesKey, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

function decryptMessage({ ciphertext, iv, authTag }, aesKey) {
  const decipher = crypto.createDecipheriv(
    AES_ALGO,
    aesKey,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

module.exports = {
  generateECDHKeyPair,
  deriveSharedKey,
  generateSigningKeyPair,
  signMessage,
  verifySignature,
  encryptMessage,
  decryptMessage,
};