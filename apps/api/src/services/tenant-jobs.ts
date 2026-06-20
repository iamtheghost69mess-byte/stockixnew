import { and, asc, eq, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { tenantLifecycleJobs } from "@repo/db/schema";
import * as schema from "@repo/db/schema";

export type TenantLifecycleJobType =
  | "tenant.provision"
  | "organization.provision"
  | "tenant.deprovision"
  | "tenant.lifecycle"
  | "add_module"
  | "remove_module"
  | "license_sync_retry"
  | "email_retry";

export async function insertTenantJob(
  db: PostgresJsDatabase<typeof schema>,
  params: {
    type: TenantLifecycleJobType;
    tenantId?: string;
    correlationId?: string;
    payload: Record<string, unknown>;
    priority?: number;
    maxAttempts?: number;
    runAt?: Date;
  },
) {
  const countRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(tenantLifecycleJobs)
    .where(
      or(
        eq(tenantLifecycleJobs.status, "pending"),
        eq(tenantLifecycleJobs.status, "running"),
      ),
    );
  const pendingOrRunningCount = Number(countRow[0]?.count ?? 0);
  if (pendingOrRunningCount >= 100) {
    throw new Error("queue_depth_limit_exceeded");
  }

  const [row] = await db
    .insert(tenantLifecycleJobs)
    .values({
      type: params.type,
      tenantId: params.tenantId ?? null,
      correlationId: params.correlationId ?? null,
      payload: params.payload,
      priority: params.priority ?? 0,
      maxAttempts: params.maxAttempts ?? 5,
      runAt: params.runAt ?? new Date(),
    })
    .returning();
  return row ?? null;
}

export async function enqueueLicenseSyncRetry(
  db: PostgresJsDatabase<typeof schema>,
  tenantId: string,
  payload: Record<string, unknown>,
  attemptNumber = 1,
) {
  const RETRY_DELAYS_MS = [5 * 60_000, 10 * 60_000, 30 * 60_000];
  const delayMs = RETRY_DELAYS_MS[Math.min(attemptNumber - 1, RETRY_DELAYS_MS.length - 1)] ?? RETRY_DELAYS_MS[0]!;
  const runAt = new Date(Date.now() + delayMs);
  return insertTenantJob(db, {
    type: "license_sync_retry",
    tenantId,
    payload: { ...payload, attemptNumber },
    maxAttempts: 3,
    runAt,
  });
}

const EMAIL_RETRY_DELAYS_MS = [2 * 60_000, 10 * 60_000, 30 * 60_000];

export async function enqueueEmailRetry(
  db: PostgresJsDatabase<typeof schema>,
  opts: {
    templateKey: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
    idempotencyKey?: string;
    tenantId?: string;
    ownerId?: string;
    attemptNumber?: number;
  },
) {
  const attempt = opts.attemptNumber ?? 1;
  const delayMs = EMAIL_RETRY_DELAYS_MS[Math.min(attempt - 1, EMAIL_RETRY_DELAYS_MS.length - 1)] ?? EMAIL_RETRY_DELAYS_MS[0]!;
  const runAt = new Date(Date.now() + delayMs);
  return insertTenantJob(db, {
    type: "email_retry",
    tenantId: opts.tenantId ?? undefined,
    payload: { ...opts, attemptNumber: attempt },
    maxAttempts: 3,
    runAt,
  });
}

export async function listTenantJobs(
  db: PostgresJsDatabase<typeof schema>,
  correlationId: string,
) {
  return db
    .select()
    .from(tenantLifecycleJobs)
    .where(eq(tenantLifecycleJobs.correlationId, correlationId))
    .orderBy(asc(tenantLifecycleJobs.createdAt));
}
