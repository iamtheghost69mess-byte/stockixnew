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
  | "remove_module";

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
