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
import {
  handleTerminalProvisionJobFailure,
  type TerminalProvisionJob,
} from "./provision-failure.js";

type Db = PostgresJsDatabase<typeof schema>;

const STUCK_MS = 10 * 60 * 1000;

let stuckReconcilerInterval: ReturnType<typeof setInterval> | null = null;

export function stopStuckProvisioningReconciler(): void {
  if (stuckReconcilerInterval) {
    clearInterval(stuckReconcilerInterval);
    stuckReconcilerInterval = null;
    logger.info("[reconciler] stuck provisioning reconciler stopped");
  }
}

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

  const stuckTenantIds = stuckRows
    .map((row) => row.tenantId)
    .filter((id): id is string => Boolean(id));

  const latestJobByTenantId = new Map<
    string,
    {
      id: string;
      status: string;
      type: string;
      correlationId: string | null;
      payload: unknown;
    }
  >();

  if (stuckTenantIds.length > 0) {
    const provisionJobs = await db
      .select({
        id: tenantLifecycleJobs.id,
        tenantId: tenantLifecycleJobs.tenantId,
        status: tenantLifecycleJobs.status,
        type: tenantLifecycleJobs.type,
        payload: tenantLifecycleJobs.payload,
        correlationId: tenantLifecycleJobs.correlationId,
        createdAt: tenantLifecycleJobs.createdAt,
      })
      .from(tenantLifecycleJobs)
      .where(
        and(
          inArray(tenantLifecycleJobs.tenantId, stuckTenantIds),
          inArray(tenantLifecycleJobs.type, ["tenant.provision", "add_module"]),
        ),
      )
      .orderBy(desc(tenantLifecycleJobs.createdAt));

    for (const job of provisionJobs) {
      if (!job.tenantId || latestJobByTenantId.has(job.tenantId)) continue;
      latestJobByTenantId.set(job.tenantId, {
        id: job.id,
        status: job.status,
        type: job.type,
        correlationId: job.correlationId,
        payload: job.payload,
      });
    }
  }

  for (const row of stuckRows) {
    if (!row.tenantId) continue;

    const latestJob = latestJobByTenantId.get(row.tenantId);

    if (
      latestJob?.status === "failed"
      || latestJob?.status === "dead"
    ) {
      const needsReconcile =
        row.tenantStatus === "provisioning"
        || row.deploymentStatus === "provisioning"
        || row.deploymentStatus === "pending"
        || (latestJob.type === "add_module" && row.tenantStatus === "provisioning");

      if (needsReconcile && latestJob.type && row.tenantId) {
        const lastError = `provision_job_${latestJob.status}`;
        const job: TerminalProvisionJob = {
          type: latestJob.type,
          tenantId: row.tenantId,
          correlationId: latestJob.correlationId,
          payload: latestJob.payload,
        };
        const outcome = await handleTerminalProvisionJobFailure(db, job, lastError);
        logger.info("[reconciler] aligned tenant after terminal job", {
          tenantId: row.tenantId,
          slug: row.slug,
          jobStatus: latestJob.status,
          jobType: latestJob.type,
          outcome,
        });
        continue;
      }
    }

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
  if (stuckReconcilerInterval) return;
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
  stuckReconcilerInterval = setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();
}
