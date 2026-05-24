import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { owners } from "@repo/db/schema";
import type { ApiServiceResult } from "../auth/types.js";

export async function getInviteByToken(
  db: PostgresJsDatabase<typeof schema>,
  token: string,
): Promise<ApiServiceResult<{ name: string; email: string }>> {
  const [owner] = await db
    .select({ name: owners.name, email: owners.email })
    .from(owners)
    .where(and(eq(owners.inviteToken, token), gt(owners.inviteTokenExpiresAt, new Date())))
    .limit(1);
  if (!owner) return { success: false, error: "Invite token invalid or expired", status: 404 };
  return { success: true, data: owner };
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

