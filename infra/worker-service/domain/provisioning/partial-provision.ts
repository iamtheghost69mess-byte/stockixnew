import { tenantDeployments, tenants } from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import type * as dbSchema from "@repo/db/schema";

export type PartialFailureKind = "pos_failed" | "wire_failed";

type Db = PostgresJsDatabase<typeof dbSchema>;

export async function markTenantPartial(
  db: Db,
  params: {
    tenantId: string;
    kind: PartialFailureKind;
    lastError: string;
  },
): Promise<void> {
  await db.update(tenants).set({ status: "partial" }).where(eq(tenants.id, params.tenantId));
  await db
    .update(tenantDeployments)
    .set({
      status: "active",
      lastError: params.lastError,
      partialFailureKind: params.kind,
      updatedAt: new Date(),
    })
    .where(eq(tenantDeployments.tenantId, params.tenantId));
}

export async function clearTenantPartialState(
  db: Db,
  tenantId: string,
  tenantStatus: "active" | "partial" = "active",
): Promise<void> {
  await db.update(tenants).set({ status: tenantStatus }).where(eq(tenants.id, tenantId));
  await db
    .update(tenantDeployments)
    .set({
      lastError: null,
      partialFailureKind: null,
      updatedAt: new Date(),
    })
    .where(eq(tenantDeployments.tenantId, tenantId));
}
