import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { tenantLifecycleJobs } from "./schema.js";
import * as schema from "./schema.js";

export type TenantLifecycleJobType =
  | "tenant.provision"
  | "tenant.deprovision"
  | "tenant.lifecycle";

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

export async function getTenantJobById(
  db: PostgresJsDatabase<typeof schema>,
  jobId: string,
) {
  const [row] = await db
    .select()
    .from(tenantLifecycleJobs)
    .where(eq(tenantLifecycleJobs.id, jobId))
    .limit(1);
  return row ?? null;
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

export async function updateTenantJob(
  db: PostgresJsDatabase<typeof schema>,
  jobId: string,
  params: {
    status: "pending" | "running" | "failed" | "completed" | "dead";
    lastError?: string | null;
    completedAt?: Date | null;
  },
) {
  const [row] = await db
    .update(tenantLifecycleJobs)
    .set({
      status: params.status,
      lastError: params.lastError ?? null,
      completedAt: params.completedAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(tenantLifecycleJobs.id, jobId))
    .returning();
  return row ?? null;
}
