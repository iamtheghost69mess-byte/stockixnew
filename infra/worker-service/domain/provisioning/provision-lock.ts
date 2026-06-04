import { createHash } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import { tenantLifecycleJobs } from "@repo/db/schema";

export function tenantProvisionLockId(tenantId: string): number {
  const hash = createHash("sha256").update(tenantId).digest();
  return hash.readInt32BE(0);
}

/** Session-level advisory lock for tenant lifecycle (provision/deprovision). */
export async function withTenantLifecycleAdvisoryLock<T>(
  db: PostgresJsDatabase<typeof dbSchema>,
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockId = tenantProvisionLockId(tenantId);
  await db.execute(sql`SELECT pg_advisory_lock(${lockId})`);
  try {
    return await fn();
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${lockId})`);
  }
}

/** @deprecated Use withTenantLifecycleAdvisoryLock */
export const withTenantProvisionAdvisoryLock = withTenantLifecycleAdvisoryLock;

export async function assertNoConcurrentTenantLifecycleJob(
  db: PostgresJsDatabase<typeof dbSchema>,
  tenantId: string,
  currentJobId: string,
): Promise<void> {
  const [active] = await db
    .select({ id: tenantLifecycleJobs.id })
    .from(tenantLifecycleJobs)
    .where(
      and(
        eq(tenantLifecycleJobs.tenantId, tenantId),
        eq(tenantLifecycleJobs.status, "running"),
        ne(tenantLifecycleJobs.id, currentJobId),
      ),
    )
    .limit(1);
  if (active) {
    throw new Error(
      `Concurrent lifecycle job for tenant ${tenantId} (job ${active.id}) — aborting`,
    );
  }
}

/** @deprecated Use assertNoConcurrentTenantLifecycleJob */
export const assertNoConcurrentProvisionJob = assertNoConcurrentTenantLifecycleJob;
