import { desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { tenantLifecycleJobs, tenants } from "@repo/db/schema";
import * as schema from "@repo/db/schema";

import { assertTenantInOwnerScope, ownerUsesTenantOrgScope } from "../org-access-scope.js";

type Db = PostgresJsDatabase<typeof schema>;

type CorrelationJobRow = {
  id: string;
  type: string;
  status: string;
  tenantId: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  tenantOwnerId: string | null;
};

export type CorrelationAccessResult =
  | { ok: true; job: CorrelationJobRow }
  | { ok: false; status: 404 | 403; error: string };

function readPayloadOwnerId(payload: Record<string, unknown> | null | undefined): string | null {
  const raw = payload?.ownerId;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function assertCorrelationJobAccess(
  db: Db,
  correlationId: string,
  actorId: string,
  actorRole: string,
  actorPermissions: readonly string[],
): Promise<CorrelationAccessResult> {
  const [job] = await db
    .select({
      id: tenantLifecycleJobs.id,
      type: tenantLifecycleJobs.type,
      status: tenantLifecycleJobs.status,
      tenantId: tenantLifecycleJobs.tenantId,
      correlationId: tenantLifecycleJobs.correlationId,
      payload: tenantLifecycleJobs.payload,
      attempts: tenantLifecycleJobs.attempts,
      maxAttempts: tenantLifecycleJobs.maxAttempts,
      createdAt: tenantLifecycleJobs.createdAt,
      updatedAt: tenantLifecycleJobs.updatedAt,
      tenantOwnerId: tenants.ownerId,
    })
    .from(tenantLifecycleJobs)
    .leftJoin(tenants, eq(tenants.id, tenantLifecycleJobs.tenantId))
    .where(eq(tenantLifecycleJobs.correlationId, correlationId))
    .orderBy(desc(tenantLifecycleJobs.createdAt))
    .limit(1);

  if (!job) {
    return { ok: false, status: 404, error: "provision_job_not_found" };
  }

  if (actorRole === "super_admin") {
    return { ok: true, job };
  }

  const payloadOwnerId = readPayloadOwnerId(job.payload);
  if (payloadOwnerId && payloadOwnerId === actorId) {
    return { ok: true, job };
  }

  if (job.tenantOwnerId && job.tenantOwnerId === actorId) {
    return { ok: true, job };
  }

  if (job.tenantId && ownerUsesTenantOrgScope(actorPermissions, actorRole)) {
    const inScope = await assertTenantInOwnerScope(
      db,
      actorId,
      job.tenantId,
      actorPermissions,
      actorRole,
    );
    if (inScope) {
      return { ok: true, job };
    }
  }

  return { ok: false, status: 403, error: "forbidden" };
}
