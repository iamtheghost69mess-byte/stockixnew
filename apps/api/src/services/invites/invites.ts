import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { owners } from "@repo/db/schema";
import { apiConfig, isMailConfigured } from "@repo/config";
import { deliverOwnerInviteEmail } from "./owner-invite-delivery.js";
import type { ApiServiceResult } from "../auth/types.js";

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export async function getInviteByToken(
  db: PostgresJsDatabase<typeof schema>,
  token: string,
): Promise<
  ApiServiceResult<{
    name: string;
    email: string;
    inviteTokenExpiresAt: string;
  }>
> {
  const [owner] = await db
    .select({
      name: owners.name,
      email: owners.email,
      inviteTokenExpiresAt: owners.inviteTokenExpiresAt,
    })
    .from(owners)
    .where(and(eq(owners.inviteToken, token), gt(owners.inviteTokenExpiresAt, new Date())))
    .limit(1);
  if (!owner?.inviteTokenExpiresAt) {
    return { success: false, error: "Invite token invalid or expired", status: 404 };
  }
  return {
    success: true,
    data: {
      name: owner.name,
      email: owner.email,
      inviteTokenExpiresAt: owner.inviteTokenExpiresAt.toISOString(),
    },
  };
}

export async function acceptInvite(
  db: PostgresJsDatabase<typeof schema>,
  input: { token: string; password: string },
): Promise<ApiServiceResult<{ ok: true }>> {
  const [owner] = await db
    .select({ id: owners.id })
    .from(owners)
    .where(and(eq(owners.inviteToken, input.token), gt(owners.inviteTokenExpiresAt, new Date())))
    .limit(1);
  if (!owner) return { success: false, error: "Invite token invalid or expired", status: 404 };

  const passwordHash = await bcrypt.hash(input.password, 12);
  await db
    .update(owners)
    .set({ passwordHash, inviteToken: null, inviteTokenExpiresAt: null })
    .where(eq(owners.id, owner.id));
  return { success: true, data: { ok: true } };
}

export async function resendOwnerInvite(
  db: PostgresJsDatabase<typeof schema>,
  ownerId: string,
  actorId?: string | null,
): Promise<
  ApiServiceResult<{
    emailSent: boolean;
    emailQueued?: boolean;
    mailConfigured: boolean;
    inviteUrl?: string;
    owner: { id: string; email: string; name: string; role: string };
  }>
> {
  const [owner] = await db
    .select({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
      passwordHash: owners.passwordHash,
      status: owners.status,
    })
    .from(owners)
    .where(eq(owners.id, ownerId))
    .limit(1);

  if (!owner) {
    return { success: false, error: "Owner not found", status: 404 };
  }
  if (owner.passwordHash) {
    return {
      success: false,
      error: "Owner already activated",
      status: 400,
    };
  }
  if (owner.status !== "active") {
    return { success: false, error: "Owner is not active", status: 400 };
  }

  const inviteToken = randomUUID();
  const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db
    .update(owners)
    .set({ inviteToken, inviteTokenExpiresAt })
    .where(eq(owners.id, owner.id));

  const dashboardUrl = apiConfig.dashboardUrl?.replace(/\/+$/, "");
  const inviteUrl = `${dashboardUrl ?? "http://localhost:3000"}/accept-invite?token=${inviteToken}`;

  const delivery = await deliverOwnerInviteEmail(db, {
    ownerId: owner.id,
    to: owner.email,
    name: owner.name,
    role: owner.role,
    inviteUrl,
    actorId: actorId ?? null,
    source: "resend",
  });

  if (delivery.mode === "queued") {
    return {
      success: true,
      data: {
        emailSent: false,
        emailQueued: true,
        mailConfigured: delivery.mailConfigured,
        owner: {
          id: owner.id,
          email: owner.email,
          name: owner.name,
          role: owner.role,
        },
      },
    };
  }

  return {
    success: true,
    data: {
      emailSent: delivery.emailSent,
      mailConfigured: delivery.mailConfigured,
      inviteUrl: delivery.inviteUrl,
      owner: {
        id: owner.id,
        email: owner.email,
        name: owner.name,
        role: owner.role,
      },
    },
  };
}

