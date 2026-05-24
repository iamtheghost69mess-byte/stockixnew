const crypto = require("crypto");
const config = require("../config/config");

/**
 * App-level AES-256-GCM envelope using FIELD_ENCRYPTION_KEY (32 bytes, base64).
 * Shape stored on documents: { ciphertext: Buffer/string, iv: Buffer, authTag: Buffer, keyVersion: number }
 */
function getKeyBytes() {
  const b64 = config.fieldEncryptionKeyB64;
  if (!b64) return null;
  const buf = Buffer.from(String(b64).trim(), "base64");
  if (buf.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must decode to 32 bytes (base64).");
  }
  return buf;
}

const KEY_VERSION = 1;

function encryptPlaintext(plain) {
  const key = getKeyBytes();
  if (!key) {
    throw new Error("FIELD_ENCRYPTION_KEY is not set.");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(String(plain), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

function decryptPayload(payload) {
  const key = getKeyBytes();
  if (!key) {
    throw new Error("FIELD_ENCRYPTION_KEY is not set.");
  }
  if (!payload || !payload.ciphertext || !payload.iv || !payload.authTag) {
    throw new Error("Invalid encrypted payload shape.");
  }
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

module.exports = {
  encryptPlaintext,
  decryptPayload,
  encryptionConfigured: () => Boolean(getKeyBytes()),
};
