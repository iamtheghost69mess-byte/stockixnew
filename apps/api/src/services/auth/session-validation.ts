import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { owners } from "@repo/db/schema";
import type { ApiServiceResult } from "./types.js";

export async function validateOwnerSession(
  db: PostgresJsDatabase<typeof schema>,
  input: { ownerId: string; role: string; sessionVersion: number },
): Promise<ApiServiceResult<{ id: string }>> {
  const [owner] = await db
    .select({
      id: owners.id,
      role: owners.role,
      status: owners.status,
      sessionVersion: owners.sessionVersion,
    })
    .from(owners)
    .where(eq(owners.id, input.ownerId))
    .limit(1);
  if (!owner || owner.status !== "active") {
    return { success: false, error: "forbidden", status: 403 };
  }
  if (owner.role !== input.role || owner.sessionVersion !== input.sessionVersion) {
    return { success: false, error: "session_stale", status: 401 };
  }
  return { success: true, data: { id: owner.id } };
}

