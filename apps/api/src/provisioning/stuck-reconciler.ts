import {
  tenantDeployments,
  tenantLifecycleJobs,
  tenants,
} from "@repo/db/schema";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@repo/db/schema";
import { infraConfig } from "@repo/config";

import { logger } from "../lib/logger.js";
import { resolveAndPersistFinanceTenantId } from "../finance-tenant-resolve.js";
import { parseTenantModules } from "../services/auth/stockix-product-token.js";

type Db = PostgresJsDatabase<typeof schema>;

const STUCK_MS = 10 * 60 * 1000;

function modulesIncludeAccounting(modulesJson: unknown): boolean {
  const raw =
    typeof modulesJson === "string"
      ? modulesJson
      : modulesJson == null
        ? undefined
        : String(modulesJson);
  const modules = parseTenantModules(raw);
  return modules.includes("accounting");
}

export async function reconcileStuckProvisioning(db: Db): Promise<void> {
  const stuckBefore = new Date(Date.now() - STUCK_MS);

  const stuckRows = await db
    .select({
      tenantId: tenants.id,
      slug: tenants.slug,
      tenantStatus: tenants.status,
      modules: tenants.modules,
      deploymentStatus: tenantDeployments.status,
      financeTenantId: tenantDeployments.financeTenantId,
      deploymentUpdatedAt: tenantDeployments.updatedAt,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(
      or(
        eq(tenants.status, "provisioning"),
        and(
          inArray(tenantDeployments.status, ["provisioning", "pending"]),
          lt(tenantDeployments.updatedAt, stuckBefore),
        ),
      ),
    )
    .limit(50);

  for (const row of stuckRows) {
    if (!row.tenantId) continue;

    const [latestJob] = await db
      .select({
        id: tenantLifecycleJobs.id,
        status: tenantLifecycleJobs.status,
        correlationId: tenantLifecycleJobs.correlationId,
      })
      .from(tenantLifecycleJobs)
      .where(
        and(
          eq(tenantLifecycleJobs.tenantId, row.tenantId),
          eq(tenantLifecycleJobs.type, "tenant.provision"),
        ),
      )
      .orderBy(desc(tenantLifecycleJobs.createdAt))
      .limit(1);

    if (
      latestJob?.status === "completed"
      && (row.tenantStatus === "provisioning"
        || row.deploymentStatus === "provisioning"
        || row.deploymentStatus === "pending")
    ) {
      await db
        .update(tenants)
        .set({ status: "active" })
        .where(eq(tenants.id, row.tenantId));
      await db
        .update(tenantDeployments)
        .set({
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(tenantDeployments.tenantId, row.tenantId));
      logger.info("[reconciler] aligned tenant status after completed job", {
        tenantId: row.tenantId,
        slug: row.slug,
      });
    }

    if (
      modulesIncludeAccounting(row.modules)
      && row.deploymentStatus === "active"
      && (row.financeTenantId == null || row.financeTenantId <= 0)
    ) {
      const resolved = await resolveAndPersistFinanceTenantId(db, row.tenantId);
      if (resolved.ok) {
        logger.info("[reconciler] auto-linked finance_tenant_id", {
          tenantId: row.tenantId,
          financeTenantId: resolved.financeTenantId,
          source: resolved.source,
        });
      }
    }
  }
}

export function startStuckProvisioningReconciler(db: Db): void {
  const intervalMs = infraConfig.provisionReconcileIntervalMs;
  const tick = async () => {
    try {
      await reconcileStuckProvisioning(db);
    } catch (error) {
      console.error(
        "[reconciler] stuck provisioning tick failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  };
  setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();
}
