import { adminAuditLog } from "@repo/db/schema";
import { apiConfig } from "@repo/config";
import type { schema, PostgresJsDatabase } from "@repo/db";
import { z } from "zod";

const actorIdSchema = z.string().uuid();

type AuditInput = {
  actorId: string;
  action: string;
  targetTenantId?: string;
  targetOwnerId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logAudit(
  db: PostgresJsDatabase<typeof schema> | null,
  input: AuditInput,
): Promise<void> {
  if (!db) return;
  const actorParsed = actorIdSchema.safeParse(input.actorId);
  if (!actorParsed.success) return;
  const fallbackIp = apiConfig.hostname;
  const normalizedIp = input.ipAddress?.trim() || fallbackIp;
  try {
    await db.insert(adminAuditLog).values({
      actorId: actorParsed.data,
      action: input.action,
      targetTenantId: input.targetTenantId ?? null,
      targetOwnerId: input.targetOwnerId ?? null,
      ipAddress: normalizedIp,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        type: "audit_insert_failed",
        action: input.action,
        actorId: actorParsed.data,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
