/**
 * AES-256-GCM field-level encryption for PMS guest PII (GDPR Article 32).
 *
 * Fields encrypted: dateOfBirth, idNumber, passportNumber, passportExpiry,
 * issuedBy, nationality, visaNumber, visaFrom, visaTo.
 *
 * Encrypted values use the "enc:v1:" prefix so existing plaintext rows
 * are read without modification (backward-compatible migration path).
 *
 * Key: PMS_FIELD_ENCRYPTION_KEY env var — 64 hex chars (32 bytes).
 * If the key is absent, values are stored and returned as plaintext
 * (safe for local development without secrets configured).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(): Buffer | null {
  const hex = process.env.PMS_FIELD_ENCRYPTION_KEY?.trim();
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, "hex");
}

export function encryptPmsField(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const key = getKey();
  if (!key) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

export function decryptPmsField(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!value.startsWith("enc:v1:")) return value;
  const key = getKey();
  if (!key) throw new Error("PMS_FIELD_ENCRYPTION_KEY is required to read encrypted PII fields");
  const buf = Buffer.from(value.slice(7), "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

/** PII field names in pmsGuests that must be encrypted at rest. */
const PII_FIELDS = [
  "nationality",
  "dateOfBirth",
  "idNumber",
  "passportNumber",
  "passportExpiry",
  "issuedBy",
  "visaNumber",
  "visaFrom",
  "visaTo",
] as const;

export type GuestPiiField = (typeof PII_FIELDS)[number];

/** Encrypt all PII fields on a guest input before inserting/updating. */
export function encryptGuestPii<T extends Partial<Record<GuestPiiField, string | null | undefined>>>(data: T): T {
  const out = { ...data };
  for (const field of PII_FIELDS) {
    if (field in out) {
      (out as Record<string, unknown>)[field] = encryptPmsField(out[field] as string | null | undefined);
    }
  }
  return out;
}

/** Decrypt all PII fields on a guest row returned from the DB. */
export function decryptGuestPii<T extends Partial<Record<GuestPiiField, string | null | undefined>>>(row: T): T {
  const out = { ...row };
  for (const field of PII_FIELDS) {
    if (field in out) {
      (out as Record<string, unknown>)[field] = decryptPmsField(out[field] as string | null | undefined);
    }
  }
  return out;
}
