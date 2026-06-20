import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const ENC_PREFIX = "enc:v1:";

export function isEncryptedDeploymentSecret(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

/**
 * AES-256-GCM secret format shared by control-plane DB columns and tenant `.env` files.
 * `secretKeyHex` must be a 32-byte key encoded as hex (DEPLOYMENT_SECRET_KEY).
 */
export function encryptDeploymentSecret(plaintext: string, secretKeyHex: string): string {
  const key = Buffer.from(secretKeyHex, "hex");
  if (key.length !== 32) {
    throw new Error("encryptDeploymentSecret requires 32-byte DEPLOYMENT_SECRET_KEY (hex)");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptDeploymentSecret(
  ciphertext: string,
  secretKeyHex: string,
): string | null {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") return null;
    const key = Buffer.from(secretKeyHex, "hex");
    if (key.length !== 32) return null;
    const iv = Buffer.from(parts[2]!, "base64url");
    const tag = Buffer.from(parts[3]!, "base64url");
    const data = Buffer.from(parts[4]!, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Derive a tenant-specific 32-byte encryption key from the master key using HKDF-SHA256.
 * Using per-tenant keys means compromising one tenant's data does not expose others.
 *
 * masterKeyHex: DEPLOYMENT_SECRET_KEY (64 hex chars = 32 bytes)
 * tenantId: UUID string — used as HKDF info to scope the derived key
 */
export function deriveTenantKey(masterKeyHex: string, tenantId: string): Buffer {
  const masterKey = Buffer.from(masterKeyHex, "hex");
  if (masterKey.length !== 32) {
    throw new Error("deriveTenantKey requires 32-byte master key (64 hex chars)");
  }
  return Buffer.from(
    hkdfSync("sha256", masterKey, Buffer.alloc(0), `tenant-secrets:${tenantId}`, 32),
  );
}

/**
 * Encrypt a deployment secret using a per-tenant derived key.
 * Produces "enc:v2:{tenantId truncated hint}:{iv}:{tag}:{ciphertext}" format.
 * The v2 prefix signals to decryptDeploymentSecretForTenant that HKDF must be used.
 */
export function encryptDeploymentSecretForTenant(
  plaintext: string,
  masterKeyHex: string,
  tenantId: string,
): string {
  const key = deriveTenantKey(masterKeyHex, tenantId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v2:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptDeploymentSecretForTenant(
  ciphertext: string,
  masterKeyHex: string,
  tenantId: string,
): string | null {
  try {
    // Support both v1 (master key) and v2 (per-tenant derived key)
    if (ciphertext.startsWith("enc:v1:")) {
      return decryptDeploymentSecret(ciphertext, masterKeyHex);
    }
    const parts = ciphertext.split(":");
    if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v2") return null;
    const key = deriveTenantKey(masterKeyHex, tenantId);
    const iv = Buffer.from(parts[2]!, "base64url");
    const tag = Buffer.from(parts[3]!, "base64url");
    const data = Buffer.from(parts[4]!, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/** Decrypt `enc:v1:` values in process.env for Finance server bootstrap. */
export function decryptEncryptedEnvVars(
  envKeys: string[],
  secretKeyHex: string | undefined,
): void {
  if (!secretKeyHex?.trim()) return;
  const key = secretKeyHex.trim();
  for (const envKey of envKeys) {
    const raw = process.env[envKey];
    if (!raw || !isEncryptedDeploymentSecret(raw)) continue;
    const plain = decryptDeploymentSecret(raw, key);
    if (plain != null) {
      process.env[envKey] = plain;
    }
  }
}
