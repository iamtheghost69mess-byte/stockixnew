import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { tenantLifecycleJobs } from "@repo/db/schema";
import * as schema from "@repo/db/schema";

export type TenantLifecycleJobType =
  | "tenant.provision"
  | "organization.provision"
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
