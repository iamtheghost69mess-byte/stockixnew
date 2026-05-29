import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { adminAuditLog, owners } from "@repo/db/schema";
import { apiConfig, isMailConfigured } from "@repo/config";
import { sendOwnerPasswordResetEmail, sendPasswordChangedEmail } from "../../mail/send.js";
import { mailSendSucceeded } from "../../mail/mailer.js";

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
): Promise<
  ApiServiceResult<{
    ok: true;
    emailSent?: boolean;
    mailConfigured: boolean;
    mailStatus?: string;
    accountPending?: boolean;
  }>
> {
  const mailConfigured = isMailConfigured();
  const email = input.email.trim().toLowerCase();
  const [owner] = await db
    .select({
      id: owners.id,
      name: owners.name,
      email: owners.email,
      passwordHash: owners.passwordHash,
      status: owners.status,
    })
    .from(owners)
    .where(eq(owners.email, email))
    .limit(1);

  if (!owner) {
    return { success: true, data: { ok: true, mailConfigured } };
  }
  if (!owner.passwordHash) {
    return {
      success: true,
      data: { ok: true, mailConfigured, accountPending: true },
    };
  }
  if (owner.status !== "active") {
    return { success: true, data: { ok: true, mailConfigured } };
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

  let resetUrl: string | null = null;
  try {
    const base = new URL(apiConfig.dashboardUrl);
    base.pathname = "/reset-password";
    base.search = "";
    base.hash = "";
    resetUrl = `${base.origin}/reset-password?token=${encodeURIComponent(raw)}`;
  } catch {
    // ignore malformed DASHBOARD_URL
  }

  let emailSent = false;
  let mailStatus: string | undefined;

  if (resetUrl) {
    const mailResult = await sendOwnerPasswordResetEmail({
      to: owner.email,
      name: owner.name,
      resetUrl,
      ownerId: owner.id,
    });
    emailSent = mailSendSucceeded(mailResult);
    mailStatus = mailResult.status;
    if (!emailSent && apiConfig.nodeEnv === "development") {
      console.info(
        `[password-reset] development link (email not sent, status=${mailStatus}): ${resetUrl}`,
      );
    } else if (!emailSent) {
      console.error(
        `[password-reset] email not sent for ${owner.email}, status=${mailStatus}`,
      );
    }
  } else if (apiConfig.nodeEnv === "development") {
    console.warn("[password-reset] DASHBOARD_URL invalid; cannot build reset link");
  }

  await db.insert(adminAuditLog).values({
    actorId: owner.id,
    action: "auth.password_reset_requested",
    targetOwnerId: owner.id,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: {
      expiresAt: expiresAt.toISOString(),
      emailSent,
      mailStatus,
      mailConfigured: isMailConfigured(),
    },
  });

  return {
    success: true,
    data: { ok: true, emailSent, mailConfigured, mailStatus },
  };
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
      email: owners.email,
      name: owners.name,
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

  void sendPasswordChangedEmail({
    to: owner.email,
    name: owner.name,
    ownerId: owner.id,
  }).catch((err) => {
    console.error(
      "[password-reset] password-changed email failed (non-fatal)",
      err instanceof Error ? err.message : String(err),
    );
  });

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
