import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { adminAuditLog, owners } from "@repo/db/schema";
import { apiConfig } from "@repo/config";

import type { ApiServiceResult } from "./types.js";

const RESET_TTL_MS = 60 * 60 * 1000;

export function generatePasswordResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function requestOwnerPasswordReset(
  db: PostgresJsDatabase<typeof schema>,
  input: {
    email: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<ApiServiceResult<{ ok: true }>> {
  const email = input.email.trim().toLowerCase();
  const [owner] = await db
    .select({
      id: owners.id,
      passwordHash: owners.passwordHash,
      status: owners.status,
    })
    .from(owners)
    .where(eq(owners.email, email))
    .limit(1);

  if (!owner?.passwordHash || owner.status !== "active") {
    return { success: true, data: { ok: true } };
  }

  const { raw, hash } = generatePasswordResetToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await db
    .update(owners)
    .set({
      passwordResetTokenHash: hash,
      passwordResetExpiresAt: expiresAt,
    })
    .where(eq(owners.id, owner.id));

  await db.insert(adminAuditLog).values({
    actorId: owner.id,
    action: "auth.password_reset_requested",
    targetOwnerId: owner.id,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: { expiresAt: expiresAt.toISOString() },
  });

  try {
    const base = new URL(apiConfig.dashboardUrl);
    base.pathname = "/reset-password";
    base.search = "";
    base.hash = "";
    const resetUrl = `${base.origin}/reset-password?token=${encodeURIComponent(raw)}`;
    if (apiConfig.nodeEnv === "development") {
      console.info(`[password-reset] development link (email delivery not configured): ${resetUrl}`);
    }
  } catch {
    // ignore malformed DASHBOARD_URL
  }

  return { success: true, data: { ok: true } };
}

export async function completeOwnerPasswordReset(
  db: PostgresJsDatabase<typeof schema>,
  input: {
    token: string;
    password: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<ApiServiceResult<{ ok: true }>> {
  const tokenHash = hashResetToken(input.token.trim());
  const now = new Date();

  const [owner] = await db
    .select({
      id: owners.id,
      passwordResetExpiresAt: owners.passwordResetExpiresAt,
      sessionVersion: owners.sessionVersion,
    })
    .from(owners)
    .where(eq(owners.passwordResetTokenHash, tokenHash))
    .limit(1);

  if (
    !owner?.passwordResetExpiresAt ||
    owner.passwordResetExpiresAt.getTime() <= now.getTime()
  ) {
    return { success: false, error: "Reset link invalid or expired", status: 400 };
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const nextVersion = (owner.sessionVersion ?? 1) + 1;

  await db
    .update(owners)
    .set({
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      sessionVersion: nextVersion,
      failedLoginCount: 0,
      lastFailedAt: null,
      lockedUntil: null,
    })
    .where(eq(owners.id, owner.id));

  await db.insert(adminAuditLog).values({
    actorId: owner.id,
    action: "auth.password_reset_completed",
    targetOwnerId: owner.id,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: {},
  });

  return { success: true, data: { ok: true } };
}
