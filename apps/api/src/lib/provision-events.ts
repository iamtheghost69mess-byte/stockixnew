import { apiConfig } from "@repo/config";
import {
  decryptDeploymentSecret,
  encryptDeploymentSecret,
} from "@repo/shared/deployment-secrets";
import type { createDb } from "@repo/db";
import { tenantLifecycleJobs, tenantProvisionEvents, tenants } from "@repo/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { PosDefaultCredentialsPayload } from "./provision-caches.js";
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

function parsePosBootstrapSecretRow(
  meta: Record<string, unknown> | null | undefined,
): PosDefaultCredentialsPayload | null {
  if (!meta || typeof meta !== "object" || meta.type !== "pos_bootstrap_pins") return null;
  const cipher = meta.cipher as string | undefined;
  if (typeof cipher !== "string") return null;
  const decrypted = decryptProvisionSecret(cipher);
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted) as PosDefaultCredentialsPayload;
  } catch {
    return null;
  }
}

async function loadPosBootstrapCredentialsByCorrelation(
  db: Db,
  correlationId: string,
): Promise<PosDefaultCredentialsPayload | null> {
  const secretRows = await db
    .select({ meta: tenantProvisionEvents.meta })
    .from(tenantProvisionEvents)
    .where(
      and(
        eq(tenantProvisionEvents.correlationId, correlationId),
        eq(tenantProvisionEvents.phase, "secret"),
      ),
    )
    .orderBy(desc(tenantProvisionEvents.createdAt))
    .limit(30);
  for (const secretRow of secretRows) {
    const parsed = parsePosBootstrapSecretRow(
      secretRow.meta as Record<string, unknown> | null | undefined,
    );
    if (parsed?.allRoles?.length) return parsed;
  }
  return null;
}

export async function loadLatestPosBootstrapCredentials(
  db: Db,
  tenantId: string,
): Promise<PosDefaultCredentialsPayload | null> {
  const secretRows = await db
    .select({ meta: tenantProvisionEvents.meta })
    .from(tenantProvisionEvents)
    .where(
      and(
        eq(tenantProvisionEvents.tenantId, tenantId),
        eq(tenantProvisionEvents.phase, "secret"),
      ),
    )
    .orderBy(desc(tenantProvisionEvents.createdAt))
    .limit(30);
  for (const secretRow of secretRows) {
    const parsed = parsePosBootstrapSecretRow(
      secretRow.meta as Record<string, unknown> | null | undefined,
    );
    if (parsed?.allRoles?.length) return parsed;
  }

  const [tenantRow] = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenantRow?.slug) return null;

  const [latestJob] = await db
    .select({ correlationId: tenantLifecycleJobs.correlationId })
    .from(tenantLifecycleJobs)
    .where(
      and(
        eq(tenantLifecycleJobs.type, "tenant.provision"),
        sql`${tenantLifecycleJobs.payload}->>'slug' = ${tenantRow.slug}`,
      ),
    )
    .orderBy(desc(tenantLifecycleJobs.createdAt))
    .limit(1);
  if (!latestJob?.correlationId) return null;
  return loadPosBootstrapCredentialsByCorrelation(db, latestJob.correlationId);
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
