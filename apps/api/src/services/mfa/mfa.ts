import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { adminAuditLog, owners } from "@repo/db/schema";
import { generateSecret, generateURI, verify } from "otplib";
import type { ApiServiceResult } from "../auth/types.js";
import { getControlPlaneRedisClient } from "../../lib/redis.js";
import { failedLoginsTotal } from "../../lib/prometheus.js";

// ─── MFA secret encryption (AES-256-GCM) ─────────────────────────────────────
// Secrets stored with the "enc:v1:" prefix are encrypted; plain values are
// treated as legacy plaintext (backward compatible with existing rows).
// Set MFA_ENCRYPTION_KEY to a 64-char hex string (32 bytes) to enable.

function getMfaEncryptionKey(): Buffer | null {
  const hex = process.env.MFA_ENCRYPTION_KEY?.trim();
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, "hex");
}

export function encryptMfaSecret(plaintext: string): string {
  const key = getMfaEncryptionKey();
  if (!key) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

export function decryptMfaSecret(value: string): string {
  if (!value.startsWith("enc:v1:")) return value;
  const key = getMfaEncryptionKey();
  if (!key) throw new Error("MFA_ENCRYPTION_KEY required to read encrypted MFA secrets");
  const buf = Buffer.from(value.slice(7), "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

// ─── TOTP replay prevention ───────────────────────────────────────────────────
// Each code is single-use within the 30-second TOTP window (90s TTL covers
// the ±1 step tolerance window used by otplib).

export async function assertNoTotpReplay(ownerId: string, code: string): Promise<boolean> {
  const redis = getControlPlaneRedisClient();
  if (!redis) return true; // fail open when Redis is not configured
  const key = `mfa:used:${ownerId}:${code}`;
  const acquired = await redis.set(key, "1", "EX", 90, "NX");
  return acquired !== null;
}

export async function beginMfaSetup(
  db: PostgresJsDatabase<typeof schema>,
  ownerId: string,
): Promise<ApiServiceResult<{ ownerId: string; secret: string; issuer: string; account: string; otpauthUri: string }>> {
  const [owner] = await db
    .select({ id: owners.id, email: owners.email, mfaEnabled: owners.mfaEnabled })
    .from(owners)
    .where(eq(owners.id, ownerId))
    .limit(1);
  if (!owner) return { success: false, error: "unauthorized", status: 401 };
  if (owner.mfaEnabled) return { success: false, error: "already_enabled", status: 409 };
  const secret = generateSecret();
  const issuer = "Stockix";
  const otpauthUri = generateURI({ secret, issuer, label: owner.email });
  await db
    .update(owners)
    .set({ mfaSecret: encryptMfaSecret(secret) })
    .where(eq(owners.id, owner.id));
  return { success: true, data: { ownerId: owner.id, secret, issuer, account: owner.email, otpauthUri } };
}

export async function enableMfa(
  db: PostgresJsDatabase<typeof schema>,
  input: { ownerId: string; code: string; ipAddress?: string | null; userAgent?: string | null },
): Promise<ApiServiceResult<{ ok: true; sessionVersion: number }>> {
  const [owner] = await db
    .select({ id: owners.id, mfaSecret: owners.mfaSecret, sessionVersion: owners.sessionVersion })
    .from(owners)
    .where(eq(owners.id, input.ownerId))
    .limit(1);
  if (!owner?.mfaSecret) return { success: false, error: "setup_expired", status: 401 };
  if (!await assertNoTotpReplay(input.ownerId, input.code)) {
    return { success: false, error: "totp_replay", status: 429 };
  }
  const plainSecret = decryptMfaSecret(owner.mfaSecret);
  const verifyResult = await verify({ token: input.code, secret: plainSecret });
  const valid = typeof verifyResult === "boolean" ? verifyResult : Boolean((verifyResult as { valid?: boolean }).valid);
  if (!valid) return { success: false, error: "Invalid MFA code", status: 401 };
  const nextVersion = (owner.sessionVersion ?? 1) + 1;
  await db
    .update(owners)
    .set({ mfaEnabled: true, sessionVersion: nextVersion })
    .where(eq(owners.id, input.ownerId));
  await db.insert(adminAuditLog).values({
    actorId: input.ownerId,
    action: "auth.mfa_enabled",
    targetOwnerId: input.ownerId,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: { outcome: "success" },
  });
  return { success: true, data: { ok: true, sessionVersion: nextVersion } };
}

export async function disableMfa(
  db: PostgresJsDatabase<typeof schema>,
  input: { ownerId: string; code: string; ipAddress?: string | null; userAgent?: string | null },
): Promise<ApiServiceResult<{ ok: true; sessionVersion: number }>> {
  const [owner] = await db
    .select({
      id: owners.id,
      mfaSecret: owners.mfaSecret,
      mfaEnabled: owners.mfaEnabled,
      sessionVersion: owners.sessionVersion,
    })
    .from(owners)
    .where(eq(owners.id, input.ownerId))
    .limit(1);
  if (!owner?.mfaEnabled || !owner.mfaSecret) return { success: false, error: "not_enabled", status: 409 };
  if (!await assertNoTotpReplay(input.ownerId, input.code)) {
    return { success: false, error: "totp_replay", status: 429 };
  }
  const plainSecret = decryptMfaSecret(owner.mfaSecret);
  const verifyResult = await verify({ token: input.code, secret: plainSecret });
  const valid = typeof verifyResult === "boolean" ? verifyResult : Boolean((verifyResult as { valid?: boolean }).valid);
  if (!valid) return { success: false, error: "Invalid MFA code", status: 401 };
  const nextVersion = (owner.sessionVersion ?? 1) + 1;
  await db
    .update(owners)
    .set({ mfaSecret: null, mfaEnabled: false, sessionVersion: nextVersion })
    .where(eq(owners.id, input.ownerId));
  await db.insert(adminAuditLog).values({
    actorId: input.ownerId,
    action: "auth.mfa_disabled",
    targetOwnerId: input.ownerId,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: { outcome: "success" },
  });
  return { success: true, data: { ok: true, sessionVersion: nextVersion } };
}

export async function getMfaStatus(
  db: PostgresJsDatabase<typeof schema>,
  ownerId: string,
) : Promise<ApiServiceResult<{ enabled: boolean; setupPending: boolean }>> {
  const [owner] = await db
    .select({ mfaEnabled: owners.mfaEnabled, mfaSecret: owners.mfaSecret })
    .from(owners)
    .where(eq(owners.id, ownerId))
    .limit(1);
  if (!owner) return { success: false, error: "unauthorized", status: 401 };
  return {
    success: true,
    data: { enabled: Boolean(owner.mfaEnabled), setupPending: !owner.mfaEnabled && Boolean(owner.mfaSecret) },
  };
}

export async function verifyMfaCode(
  db: PostgresJsDatabase<typeof schema>,
  input: { ownerId: string; code: string; ipAddress?: string | null; userAgent?: string | null },
): Promise<
  ApiServiceResult<{ id: string; role: string; email: string; name: string; sessionVersion: number }>
> {
  const [owner] = await db
    .select({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
      status: owners.status,
      mfaSecret: owners.mfaSecret,
      sessionVersion: owners.sessionVersion,
      failedLoginCount: owners.failedLoginCount,
      lockedUntil: owners.lockedUntil,
    })
    .from(owners)
    .where(eq(owners.id, input.ownerId))
    .limit(1);
  if (!owner || !owner.mfaSecret) return { success: false, error: "MFA not configured", status: 401 };
  if (owner.status !== "active") return { success: false, error: "Account disabled", status: 403 };
  if (owner.lockedUntil && owner.lockedUntil.getTime() > Date.now()) {
    return { success: false, error: "Account temporarily locked. Try again later.", status: 423 };
  }
  if (!await assertNoTotpReplay(input.ownerId, input.code)) {
    return { success: false, error: "totp_replay", status: 429 };
  }
  const plainSecret = decryptMfaSecret(owner.mfaSecret);
  const verifyResult = await verify({ token: input.code, secret: plainSecret });
  const valid = typeof verifyResult === "boolean" ? verifyResult : Boolean((verifyResult as { valid?: boolean }).valid);
  if (!valid) {
    failedLoginsTotal.inc();
    const nextFailed = (owner.failedLoginCount ?? 0) + 1;
    await db
      .update(owners)
      .set({
        failedLoginCount: nextFailed,
        lastFailedAt: new Date(),
        lockedUntil: nextFailed >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
      })
      .where(eq(owners.id, owner.id));
    await db.insert(adminAuditLog).values({
      actorId: owner.id,
      action: "auth.mfa_failed",
      targetOwnerId: owner.id,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { failedCount: nextFailed },
    });
    return { success: false, error: "Invalid MFA code", status: 401 };
  }
  await db
    .update(owners)
    .set({
      lastLoginAt: new Date(),
      failedLoginCount: 0,
      lastFailedAt: null,
      lockedUntil: null,
    })
    .where(eq(owners.id, owner.id));
  await db.insert(adminAuditLog).values({
    actorId: owner.id,
    action: "auth.login_success",
    targetOwnerId: owner.id,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: { mfa: true },
  });
  return {
    success: true,
    data: {
      id: owner.id,
      role: owner.role,
      email: owner.email,
      name: owner.name,
      sessionVersion: owner.sessionVersion ?? 1,
    },
  };
}

