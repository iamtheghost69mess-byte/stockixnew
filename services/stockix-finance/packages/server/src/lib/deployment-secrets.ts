/**
 * Keep in sync with repo `packages/shared/src/deployment-secrets.ts` (Finance Docker context).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENC_PREFIX = "enc:v1:";

export function isEncryptedDeploymentSecret(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

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
