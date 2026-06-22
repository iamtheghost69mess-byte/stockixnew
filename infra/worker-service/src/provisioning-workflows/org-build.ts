// Extracted org build functions
import { eq } from "drizzle-orm";
import { tenantDeployments, tenantConfig } from "@repo/db/schema";
import { getTenantStackPaths, readTenantEnvFile } from "../../domain/provisioning/tenant-env.js";
import { composeProjectName } from "../../domain/provisioning/compose-project-name.js";
import { join } from "node:path";
import { execa } from "execa";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";

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
        `[add-module-revert] tenant status update failed: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  await db
    .update(tenantDeployments)
    .set({ status: "active", lastError: trimmedReason, updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, tenantId))
    .catch((error) => {
      log(
        `[add-module-revert] deployment update failed: ${error instanceof Error ? error.message : String(error)
        }`,
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
        `[add-module-revert] lifecycle job update failed: ${error instanceof Error ? error.message : String(error)
        }`,
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
        `[add-module-revert] provision event insert failed: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  log(`[add-module-revert] tenant=${tenantId} correlationId=${correlationId} reason=${trimmedReason}`);
}

