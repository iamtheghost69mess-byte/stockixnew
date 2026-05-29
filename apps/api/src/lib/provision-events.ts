import { apiConfig } from "@repo/config";
import {
  decryptDeploymentSecret,
  encryptDeploymentSecret,
} from "@repo/shared/deployment-secrets";
import type { createDb } from "@repo/db";
import { tenantProvisionEvents } from "@repo/db/schema";
import { asc, eq } from "drizzle-orm";

import { emitProvisionEvent } from "../provision-bus.js";
import { rowToProvisionPayload } from "../provision-trace.js";
import { invalidateTenantReadinessCache } from "../provisioning/readiness-engine.js";

type Db = ReturnType<typeof createDb>;

export function encryptProvisionSecret(plaintext: string): string {
  return encryptDeploymentSecret(plaintext, apiConfig.deploymentSecretKey);
}

export function decryptProvisionSecret(ciphertext: string): string | null {
  return decryptDeploymentSecret(ciphertext, apiConfig.deploymentSecretKey);
}

export async function appendProvisionEventSafe(
  db: Db,
  args: {
    correlationId: string;
    phase: string;
    level?: "info" | "warn" | "error";
    message: string;
    slug?: string | null;
    tenantId?: string | null;
    parentTenantId?: string | null;
    deploymentId?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  const [row] = await db
    .insert(tenantProvisionEvents)
    .values({
      correlationId: args.correlationId,
      phase: args.phase,
      level: args.level ?? "info",
      message: args.message,
      slug: args.slug ?? null,
      tenantId: args.tenantId ?? null,
      parentTenantId: args.parentTenantId ?? null,
      deploymentId: args.deploymentId ?? null,
      meta: args.meta ?? null,
    })
    .returning();
  if (row) {
    emitProvisionEvent(rowToProvisionPayload(row));
  }
  invalidateTenantReadinessCache(args.correlationId);
}

export async function loadProvisionEventsJson(db: Db, correlationId: string) {
  const rows = await db
    .select({
      id: tenantProvisionEvents.id,
      phase: tenantProvisionEvents.phase,
      level: tenantProvisionEvents.level,
      message: tenantProvisionEvents.message,
      meta: tenantProvisionEvents.meta,
      createdAt: tenantProvisionEvents.createdAt,
    })
    .from(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.correlationId, correlationId))
    .orderBy(asc(tenantProvisionEvents.createdAt), asc(tenantProvisionEvents.id))
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    phase: r.phase,
    level: r.level,
    message: r.message,
    meta: r.meta ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
