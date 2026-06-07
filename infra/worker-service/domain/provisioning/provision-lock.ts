import { createHash } from "node:crypto";
import postgres from "postgres";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import { apiConfig } from "@repo/config";
import { and, eq, ne } from "drizzle-orm";
import { tenantLifecycleJobs } from "@repo/db/schema";

let lockClient: ReturnType<typeof postgres> | null = null;
let lockClientInitFailed = false;

function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  return apiConfig.databaseUrl;
}

async function getLockClient(): Promise<ReturnType<typeof postgres>> {
  if (lockClientInitFailed) {
    throw new Error("advisory lock connection previously failed");
  }
  if (lockClient) return lockClient;

  const connectionString = resolveDatabaseUrl();
  try {
    lockClient = postgres(connectionString, { max: 1, idle_timeout: 0 });
    await lockClient`SELECT 1`;
    return lockClient;
  } catch (error) {
    lockClientInitFailed = true;
    lockClient = null;
    console.error(
      JSON.stringify({
        level: "error",
        event: "advisory_lock_connection_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  }
}

export async function shutdownAdvisoryLockClient(): Promise<void> {
  if (!lockClient) return;
  try {
    await lockClient.end({ timeout: 5 });
  } catch {
    // Best-effort shutdown.
  } finally {
    lockClient = null;
  }
}

export function tenantProvisionLockId(tenantId: string): number {
  const hash = createHash("sha256").update(tenantId).digest();
  return hash.readInt32BE(0);
}

/** Session-level advisory lock for tenant lifecycle (provision/deprovision). */
export async function withTenantLifecycleAdvisoryLock<T>(
  _db: PostgresJsDatabase<typeof dbSchema>,
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockId = tenantProvisionLockId(tenantId);
  const client = await getLockClient();

  if (process.env.PROVISION_LOCK_DEBUG === "1") {
    const [{ pid }] = await client<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    console.info(
      JSON.stringify({
        level: "info",
        event: "advisory_lock_acquire",
        tenantId,
        lockId,
        pgBackendPid: pid,
      }),
    );
  }

  await client`SELECT pg_advisory_lock(${lockId})`;
  try {
    return await fn();
  } finally {
    await client`SELECT pg_advisory_unlock(${lockId})`;
    if (process.env.PROVISION_LOCK_DEBUG === "1") {
      const [{ pid }] = await client<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      console.info(
        JSON.stringify({
          level: "info",
          event: "advisory_lock_release",
          tenantId,
          lockId,
          pgBackendPid: pid,
        }),
      );
    }
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
