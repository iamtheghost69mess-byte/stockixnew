// Extracted org build functions
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { tenantDeployments, tenants, tenantLifecycleJobs, tenantProvisionEvents } from "@repo/db/schema";
import { getTenantStackPaths } from "../../domain/provision-paths.js";
import { defaultTenantEnvRoot } from "../../domain/env-paths.js";
import { readTenantEnvFile } from "../../domain/provisioning/tenant-env.js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { TenantProvisionServiceDeps } from "../../domain/provisioning/tenant-provision-service.js";
import * as dbSchema from "@repo/db/schema";
import { loadProvisionJournalState } from "../provision-journal.js";
import { cleanupMysqlOrphan } from "../../domain/provisioning/adapters/check-mysql-orphan.js";

type ComposeRollbackCtx = {
  composeFile: string;
  project: string;
  envPath: string;
  composeEnv: Record<string, string>;
};

export async function persistFinanceDeploymentIds(
  db: PostgresJsDatabase<typeof dbSchema>,
  deploymentId: string | undefined,
  ids: {
    financeTenantId?: number;
    financeDefaultWarehouseId?: number;
    walkInCustomerId?: number;
    cashAccountId?: number;
    cardAccountId?: number;
  },
): Promise<void> {
  if (!deploymentId) return;
  const patch: Record<string, number> = {};
  if (ids.financeTenantId && ids.financeTenantId > 0) {
    patch.financeTenantId = ids.financeTenantId;
  }
  if (ids.financeDefaultWarehouseId && ids.financeDefaultWarehouseId > 0) {
    patch.financeDefaultWarehouseId = ids.financeDefaultWarehouseId;
  }
  if (ids.walkInCustomerId && ids.walkInCustomerId > 0) {
    patch.financeWalkInCustomerId = ids.walkInCustomerId;
  }
  if (ids.cashAccountId && ids.cashAccountId > 0) {
    patch.financeCashAccountId = ids.cashAccountId;
  }
  if (ids.cardAccountId && ids.cardAccountId > 0) {
    patch.financeCardAccountId = ids.cardAccountId;
  }
  if (Object.keys(patch).length === 0) return;
  await db
    .update(tenantDeployments)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(tenantDeployments.id, deploymentId));
}

export async function rollbackProvision(
  db: PostgresJsDatabase<typeof dbSchema>,
  tenantId: string,
  correlationId: string,
  reason: string,
  options: {
    deps?: TenantProvisionServiceDeps;
    composeCtx?: ComposeRollbackCtx | null;
    log?: (m: string) => void;
  } = {},
): Promise<void> {
  const log = options.log ?? (() => undefined);
  const trimmedReason = reason.slice(0, 4000);

  // Keep the Postgres tenant row in `failed` status as the ops handle when rollback
  // cleanup is incomplete — never delete tenant rows from rollbackProvision().
  await db
    .update(tenants)
    .set({ status: "failed" })
    .where(eq(tenants.id, tenantId))
    .catch((error) => {
      log(
        `[rollback] tenant status update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

  await db
    .update(tenantDeployments)
    .set({ status: "failed", lastError: trimmedReason, updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, tenantId))
    .catch((error) => {
      log(
        `[rollback] deployment status update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

  const jobTerminalStatus = trimmedReason.startsWith("cancelled_by_user") ? "cancelled" : "failed";
  await db
    .update(tenantLifecycleJobs)
    .set({
      status: jobTerminalStatus,
      lastError: trimmedReason,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tenantLifecycleJobs.correlationId, correlationId))
    .catch((error) => {
      log(
        `[rollback] lifecycle job update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

  let composeCtx = options.composeCtx ?? null;
  let rollbackSlug: string | undefined;
  if (!composeCtx) {
    const [depRow] = await db
      .select({
        slug: tenants.slug,
        composeProjectName: tenantDeployments.composeProjectName,
        internalPort: tenantDeployments.internalPort,
      })
      .from(tenants)
      .innerJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId))
      .limit(1);
    rollbackSlug = depRow?.slug;
    if (depRow?.slug && depRow.composeProjectName) {
      const { tenantComposeFile: composeFile, stockixFinanceRoot } = getTenantStackPaths();
      const tenantEnvRoot = defaultTenantEnvRoot();
      const envPath = join(tenantEnvRoot, depRow.slug, ".env");
      composeCtx = {
        composeFile,
        project: depRow.composeProjectName,
        envPath,
        composeEnv: {
          STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot,
          COMPOSE_PROJECT_NAME: depRow.composeProjectName,
        },
      };
    }
  } else {
    const [slugRow] = await db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    rollbackSlug = slugRow?.slug;
  }

  log(`[rollback] DEBUG: preserving tenant stack and containers for debugging.`);

  const journalState = await loadProvisionJournalState(db, correlationId);

  if (rollbackSlug && journalState.completedOps.has("docker.data_step")) {
    try {
      const cleaned = await cleanupMysqlOrphan(rollbackSlug, log);
      if (cleaned) {
        log(`[rollback] MySQL databases cleaned for slug=${rollbackSlug}`);
      } else {
        log(`[rollback][warn] MySQL cleanup failed for slug=${rollbackSlug} — use scripts/cleanup-mysql-orphans.mjs to clean manually`);
      }
    } catch (mysqlErr) {
      log(`[rollback][warn] MySQL cleanup error for slug=${rollbackSlug}: ${mysqlErr instanceof Error ? mysqlErr.message : String(mysqlErr)}`);
    }
  }

  if (composeCtx?.envPath) {
    await rm(join(composeCtx.envPath, ".."), { recursive: true, force: true }).catch((rmErr) => {
      log(`[rollback] env dir cleanup failed: ${rmErr instanceof Error ? rmErr.message : String(rmErr)}`);
    });
  }

  await db
    .insert(tenantProvisionEvents)
    .values({
      correlationId,
      tenantId,
      phase: "api",
      level: "error",
      message: trimmedReason,
    })
    .catch((error) => {
      log(
        `[rollback] provision event insert failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

  log(`[rollback] tenant=${tenantId} correlationId=${correlationId} reason=${trimmedReason}`);
}

export async function revertAddModuleFailure(
  db: PostgresJsDatabase<typeof dbSchema>,
  tenantId: string,
  correlationId: string,
  reason: string,
  log: (m: string) => void = () => undefined,
): Promise<void> {
  const trimmedReason = reason.slice(0, 4000);
  await db
    .update(tenants)
    .set({ status: "active" })
    .where(eq(tenants.id, tenantId))
    .catch((error) => {
      log(
        `[add-module-revert] tenant status update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  await db
    .update(tenantDeployments)
    .set({ status: "active", lastError: trimmedReason, updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, tenantId))
    .catch((error) => {
      log(
        `[add-module-revert] deployment update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  await db
    .update(tenantLifecycleJobs)
    .set({
      status: "failed",
      lastError: trimmedReason,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tenantLifecycleJobs.correlationId, correlationId))
    .catch((error) => {
      log(
        `[add-module-revert] lifecycle job update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  await db
    .insert(tenantProvisionEvents)
    .values({
      correlationId,
      tenantId,
      phase: "api",
      level: "error",
      message: trimmedReason,
    })
    .catch((error) => {
      log(
        `[add-module-revert] provision event insert failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  log(`[add-module-revert] tenant=${tenantId} correlationId=${correlationId} reason=${trimmedReason}`);
}
