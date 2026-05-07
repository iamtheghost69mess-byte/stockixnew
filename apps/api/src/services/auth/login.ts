import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { adminAuditLog, owners } from "@repo/db/schema";
import type { ApiServiceResult } from "./types.js";

type LoginSuccess =
  | { requiresMfa: true; ownerId: string }
  | {
      requiresMfa: false;
      id: string;
      role: string;
      email: string;
      name: string;
      sessionVersion: number;
    };

export async function loginOwner(
  db: PostgresJsDatabase<typeof schema>,
  input: { email: string; password: string; ipAddress?: string | null; userAgent?: string | null },
): Promise<ApiServiceResult<LoginSuccess>> {
  const [owner] = await db
    .select({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
      status: owners.status,
      passwordHash: owners.passwordHash,
      mfaEnabled: owners.mfaEnabled,
      sessionVersion: owners.sessionVersion,
      failedLoginCount: owners.failedLoginCount,
      lockedUntil: owners.lockedUntil,
    })
    .from(owners)
    .where(eq(owners.email, input.email))
    .limit(1);

  if (!owner) return { success: false, error: "Invalid email or password", status: 401 };
  if (owner.status !== "active") return { success: false, error: "Account disabled", status: 403 };
  if (owner.lockedUntil && owner.lockedUntil.getTime() > Date.now()) {
    return { success: false, error: "Account temporarily locked. Try again later.", status: 423 };
  }
  if (!owner.passwordHash) {
    await db
      .update(owners)
      .set({ failedLoginCount: (owner.failedLoginCount ?? 0) + 1, lastFailedAt: new Date() })
      .where(eq(owners.id, owner.id));
    return { success: false, error: "Invalid email or password", status: 401 };
  }

  const ok = await bcrypt.compare(input.password, owner.passwordHash);
  if (!ok) {
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
      action: "auth.login_failed",
      targetOwnerId: owner.id,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { reason: "invalid_password", failedCount: nextFailed },
    });
    return { success: false, error: "Invalid email or password", status: 401 };
  }

  if (owner.mfaEnabled) {
    return { success: true, data: { requiresMfa: true, ownerId: owner.id } };
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
    metadata: { mfa: false },
  });

  return {
    success: true,
    data: {
      requiresMfa: false,
      id: owner.id,
      role: owner.role,
      email: owner.email,
      name: owner.name,
      sessionVersion: owner.sessionVersion ?? 1,
    },
  };
}

export async function reconfirmOwnerPassword(
  db: PostgresJsDatabase<typeof schema>,
  input: { ownerId: string; password: string },
): Promise<ApiServiceResult<{ ok: true }>> {
  const [owner] = await db
    .select({ id: owners.id, passwordHash: owners.passwordHash })
    .from(owners)
    .where(eq(owners.id, input.ownerId))
    .limit(1);
  if (!owner?.passwordHash) return { success: false, error: "Invalid password", status: 401 };
  const ok = await bcrypt.compare(input.password, owner.passwordHash);
  if (!ok) return { success: false, error: "Invalid password", status: 401 };
  return { success: true, data: { ok: true } };
}

