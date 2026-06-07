import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";

import { apiConfig, posConfig } from "@repo/config";
import { decryptDeploymentSecret, encryptDeploymentSecret } from "@repo/shared/deployment-secrets";
import { allocateOrganizationNumber, allocateTenantPort, assertTenantPortAvailable } from "@repo/db";
import { tenantConfig, tenantDeployments, tenantLifecycleJobs, tenantProvisionEvents, tenants } from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { asc, eq } from "drizzle-orm";
import * as dbSchema from "@repo/db/schema";

import { CryptoTenantSecretGenerator } from "../domain/provisioning/adapters/crypto-tenant-secret-generator.js";
import { defaultTenantEnvRoot } from "../domain/env-paths.js";
import { deprovisionTenantDatabases, provisionTenant } from "../domain/provisioner.js";
import { getTenantStackPaths } from "../domain/provision-paths.js";
import { createProvisionTracer } from "../domain/provision-trace.js";
import { composeProjectName } from "../domain/provisioning/compose-project-name.js";
import {
  COMPOSE_DOWN_TIMEOUT_MS,
  resolveComposeStepTimeoutMs,
  STOCKIX_FINANCE_HEALTH_TIMEOUT_MS,
} from "../domain/provisioning/constants.js";
import { MENA_DEFAULTS, type OrgBuildSettings } from "../domain/provisioning/adapters/fetch-stockix-finance-org-settings.js";
import type { TenantProvisionServiceDeps } from "../domain/provisioning/tenant-provision-service.js";
import {
  buildTenantEnvMap,
  buildTenantMongoUrl,
  writeTenantEnvFileAtomic,
} from "../domain/provisioning/tenant-env.js";
import { activateFinanceWarehouses } from "../domain/provisioning/adapters/activate-finance-warehouses.js";
import {
  copyCoaAcrossStacks,
  isSeparateStackSubOrg,
} from "../domain/provisioning/adapters/copy-coa-across-stacks.js";
import { seedFinancePosDefaults } from "../domain/provisioning/adapters/seed-finance-pos-defaults.js";
import { wirePosBigcapitalIntegration } from "../domain/provisioning/adapters/wire-pos-bigcapital-integration.js";
import { verifyPosBigcapitalIntegration } from "../domain/provisioning/adapters/verify-pos-bigcapital-integration.js";
import { completeFinanceSetupWizard } from "../domain/provisioning/adapters/complete-finance-setup-wizard.js";
import {
  clearTenantPartialState,
  markTenantPartial,
} from "../domain/provisioning/partial-provision.js";
import {
  getLicenseExpiry,
  getPlanLimits,
  sendFinanceWelcomeEmail,
  sendPosWelcomeEmail,
} from "@repo/platform-worker-shared";
import {
  FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS,
  syncFinanceLicense,
} from "../domain/provisioning/adapters/sync-finance-license.js";
import { assertRequiredTenantImages } from "../domain/provisioning/check-tenant-images.js";
import { ensureTenantExternalNetworks } from "../domain/provisioning/ensure-tenant-networks.js";
import { buildPreflightDownArgs } from "../domain/provisioning/build-preflight-down-args.js";
import { redactComposeLogLine } from "../domain/provisioning/redact-compose-log.js";
import {
  assertNoConcurrentTenantLifecycleJob,
  withTenantLifecycleAdvisoryLock,
} from "../domain/provisioning/provision-lock.js";
import { composeDownBestEffort, runDockerExec } from "../domain/provisioning/tenant-docker-workflow.js";
import { TENANT_SERVER_UP_COMPOSE_ARGS } from "../domain/provisioning/tenant-server-compose-args.js";
import type { ProvisionInput, ProvisionResult } from "../domain/provisioning/types.js";
import { provisionChatwootAccount } from "./chatwoot-provision.js";
import {
  hasAccountingAndPos,
  isModuleGatingEnabled,
  isPosOnlyModules,
  shouldProvisionFinanceStack,
  provisionPmsStack,
  provisionPosStackTracked,
  resolvePosTenantEnvPath,
  resolveTenantModules,
} from "./module-stacks.js";

type PosProvisionOutcome = {
  posStatus: "ok" | "failed" | "skipped";
  posError?: string;
  posOrganizationId?: string;
  posUrl?: string;
  posApiUrl?: string;
  posHostPort?: number;
  integrationWired?: boolean;
  posDefaultCredentials?: import("../domain/provisioning/types.js").PosDefaultCredentials;
};

function assertProvisionModuleEnv(modules: string[]): void {
  if (modules.includes("pos")) {
    const key = posConfig.platformApiKey.trim();
    if (key.length < 10) {
      throw new Error(
        "POS_PLATFORM_API_KEY is required for POS provisioning (min 10 characters)",
      );
    }
  }
  // Finance stack requests (including organization build + license guarded writes)
  // require internal API secret for internal endpoints.
  if (shouldProvisionFinanceStack(modules) && !apiConfig.internalApiSecret?.trim()) {
    throw new Error(
      "INTERNAL_API_SECRET is required when provisioning the Finance stack",
    );
  }
}

async function runPosProvisionStep(params: {
  licensedModules: string[];
  slug: string;
  tenantId: string | undefined;
  tenantName: string;
  adminEmail: string;
  planSlug?: string;
  financeInternalPort?: number;
  db: PostgresJsDatabase<typeof dbSchema>;
  log: (m: string) => void;
  trace: ReturnType<typeof createProvisionTracer>;
  hasOp?: (key: string) => boolean;
  markOp?: (key: string, msg: string, meta?: Record<string, unknown>) => Promise<void>;
  posOrganizationId?: string;
  posUrl?: string;
  posApiUrl?: string;
}): Promise<PosProvisionOutcome> {
  if (!params.licensedModules.includes("pos") || !params.tenantId) {
    return { posStatus: "skipped" };
  }
  try {
    let posOrganizationId = params.posOrganizationId;
    let posUrl = params.posUrl;
    let posApiUrl = params.posApiUrl;
    if (
      params.hasOp?.("pos.bootstrap_organization")
      && params.db
      && params.tenantId
      && !posOrganizationId?.trim()
    ) {
      const [dep] = await params.db
        .select({
          posOrganizationId: tenantDeployments.posOrganizationId,
          posUrl: tenantDeployments.posUrl,
        })
        .from(tenantDeployments)
        .where(eq(tenantDeployments.tenantId, params.tenantId))
        .limit(1);
      posOrganizationId = dep?.posOrganizationId ?? undefined;
      posUrl = dep?.posUrl ?? undefined;
    }
    let licenseExpiresAt: Date | null = null;
    try {
      licenseExpiresAt = await getLicenseExpiry(params.db, params.tenantId);
    } catch (licenseErr) {
      const msg =
        licenseErr instanceof Error ? licenseErr.message : String(licenseErr);
      params.log(`[provision][pos] license expiry lookup failed (using default): ${msg}`);
    }
    const planSlug = params.planSlug?.trim() || "starter";
    const planLimits = await getPlanLimits(params.db, planSlug);
    const posResult = await provisionPosStackTracked(
      {
        slug: params.slug,
        tenantId: params.tenantId,
        tenantName: params.tenantName,
        adminEmail: params.adminEmail,
        db: params.db,
        log: params.log,
        financeInternalPort: params.financeInternalPort,
        licenseExpiresAt,
        tenantModules: params.licensedModules,
        planSlug,
        maxUsers: planLimits.maxUsers,
        trace: params.trace,
        hasOp: params.hasOp,
        markOp: params.markOp,
        posOrganizationId,
        posUrl,
        posApiUrl,
        afterBootstrap: async () => {
          if (params.hasOp?.("pos.schema_migration")) {
            params.log("[provision][pos] Skipping schema migration (already journaled)");
            return;
          }
          const { repoRoot } = getTenantStackPaths();
          const composeFile = join(repoRoot, "infra", "pos-tenant-stack", "docker-compose.yml");
          const project = `stockix-pos-${params.slug}`;
          const envPath = resolvePosTenantEnvPath(params.slug);
          const tenantEnv = await readTenantEnvFile(params.slug);
          params.log("[provision] step start: pos.schema_migration");
          await runDockerExec({
            composeFile,
            project,
            envPath,
            composeEnv: {
              ...process.env,
              ...tenantEnv,
              COMPOSE_PROJECT_NAME: project,
            } as Record<string, string>,
            service: "pos-backend",
            command: ["node", "scripts/run-schema-migrations.js"],
            timeoutMs: 60_000,
            log: params.log,
          });
          await params.markOp?.("pos.schema_migration", "POS Mongo schema migrations applied");
          params.log("[provision] step done: pos.schema_migration");
        },
      },
      params.trace,
    );
    const credentials = posResult.posDefaultCredentials?.allRoles ?? [];
    if (credentials.length > 0 && posResult.posUrl) {
      try {
        await sendPosWelcomeEmail({
          to: params.adminEmail,
          tenantName: params.tenantName,
          posUrl: posResult.posUrl,
          credentials,
        });
        params.log(`[provision][pos] credentials email sent to ${params.adminEmail}`);
      } catch (emailErr) {
        params.log(
          `[provision][pos] credentials email failed (non-fatal): ${emailErr instanceof Error ? emailErr.message : String(emailErr)
          }`,
        );
      }
    }
    return {
      posStatus: "ok",
      posOrganizationId: posResult.posOrganizationId,
      posUrl: posResult.posUrl,
      posApiUrl: posResult.posApiUrl,
      posHostPort: posResult.posHostPort,
      posDefaultCredentials: posResult.posDefaultCredentials,
    };
  } catch (posErr) {
    const posError = posErr instanceof Error ? posErr.message : String(posErr);
    params.log(`[provision][pos] failed: ${posError}`);
    return { posStatus: "failed", posError };
  }
}

async function runWirePosIntegrationStep(params: {
  licensedModules: string[];
  slug: string;
  posOrganizationId: string;
  posHostPort: number;
  financeInternalPort: number;
  workerInternalUrl?: string;
  financeTenantId: number;
  walkInCustomerId: number;
  cashAccountId: number;
  cardAccountId: number;
  serviceChargeItemId?: number;
  discountItemId?: number;
  financeDefaultWarehouseId?: number;
  defaultVendorId?: number;
  inventoryAccountId?: number;
  inventoryVarianceAccountId?: number;
  log: (m: string) => void;
  trace: ReturnType<typeof createProvisionTracer>;
  markOp: (
    operationKey: string,
    message: string,
    meta?: Record<string, unknown>,
  ) => Promise<void>;
  hasOp: (key: string) => boolean;
  /** When true, re-run wire even if journal already recorded (POS-only retry). */
  forceRerun?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasAccountingAndPos(params.licensedModules)) {
    return { ok: true };
  }
  if (!params.forceRerun && params.hasOp("tenant.wire_pos_integration")) {
    const health = await verifyPosBigcapitalIntegration({
      posOrganizationId: params.posOrganizationId,
      posHostPort: params.posHostPort,
      log: params.log,
    });
    if (health.healthy) {
      await params.trace.event("resume", "Skipping POS integration wire (already journaled)", {
        meta: { operationKey: "tenant.wire_pos_integration" },
      });
      return { ok: true };
    }
    await params.trace.event(
      "resume",
      "Re-wiring POS integration (journaled but health check failed)",
      {
        meta: {
          operationKey: "tenant.wire_pos_integration",
          healthReason: health.reason ?? "unknown",
        },
      },
    );
  }
  try {
    params.log("[provision] step start: tenant.wire_pos_integration");
    await params.trace.event("progress", "Wiring POS Bigcapital integration", {
      meta: {
        operationKey: "tenant.wire_pos_integration",
        posOrganizationId: params.posOrganizationId,
      },
    });
    const wired = await wirePosBigcapitalIntegration({
      posOrganizationId: params.posOrganizationId,
      posHostPort: params.posHostPort,
      slug: params.slug,
      internalPort: params.financeInternalPort,
      workerInternalUrl: params.workerInternalUrl,
      financeTenantId: params.financeTenantId,
      walkInCustomerId: params.walkInCustomerId,
      cashAccountId: params.cashAccountId,
      cardAccountId: params.cardAccountId,
      serviceChargeItemId: params.serviceChargeItemId,
      discountItemId: params.discountItemId,
      defaultWarehouseId: params.financeDefaultWarehouseId,
      defaultVendorId: params.defaultVendorId,
      inventoryAccountId: params.inventoryAccountId,
      inventoryVarianceAccountId: params.inventoryVarianceAccountId,
      log: params.log,
    });
    await params.markOp("tenant.wire_pos_integration", "POS Bigcapital integration wired", {
      internalBaseUrl: wired.internalBaseUrl,
      posOrganizationId: params.posOrganizationId,
    });
    params.log("[provision] step done: tenant.wire_pos_integration");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await params.trace.event("pos.integration.wire_failed", `Integration wire failed: ${msg}`, {
      level: "error",
      meta: { error: msg },
    });
    return { ok: false, error: msg };
  }
}

async function persistFinanceDeploymentIds(
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

function encryptDeploymentSecretLocal(plaintext: string): string {
  return encryptDeploymentSecret(plaintext, apiConfig.deploymentSecretKey);
}

function decryptDeploymentSecretLocal(ciphertext: string): string {
  const plain = decryptDeploymentSecret(ciphertext, apiConfig.deploymentSecretKey);
  if (!plain) {
    throw new Error("deployment_secret_decrypt_failed");
  }
  return plain;
}

async function resolvePosBackendHostPort(slug: string): Promise<number | null> {
  const project = `stockix-pos-${slug}`;
  try {
    const { stdout } = await execa("docker", [
      "compose",
      "-p",
      project,
      "port",
      "pos-backend",
      "8010",
    ]);
    const match = stdout.trim().match(/:(\d+)\s*$/);
    if (!match?.[1]) return null;
    return Number(match[1]);
  } catch {
    return null;
  }
}

import { loadProvisionJournalState } from "./provision-journal.js";

type ComposeRollbackCtx = {
  composeFile: string;
  project: string;
  envPath: string;
  composeEnv: Record<string, string>;
};

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
        `[rollback] tenant status update failed: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    });

  await db
    .update(tenantDeployments)
    .set({ status: "failed", lastError: trimmedReason, updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, tenantId))
    .catch((error) => {
      log(
        `[rollback] deployment status update failed: ${error instanceof Error ? error.message : String(error)
        }`,
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
        `[rollback] lifecycle job update failed: ${error instanceof Error ? error.message : String(error)
        }`,
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

  if (composeCtx && options.deps) {
    const rolledBack = await composeDownBestEffort(options.deps.docker, composeCtx);
    log(
      `[rollback] compose cleanup ${rolledBack ? "completed" : "failed"} project=${composeCtx.project}`,
    );
  } else if (composeCtx) {
    try {
      await execa(
        "docker",
        [
          "compose",
          "-f",
          composeCtx.composeFile,
          "-p",
          composeCtx.project,
          "--env-file",
          composeCtx.envPath,
          "down",
          "--remove-orphans",
          "-v",
          "--timeout",
          "30",
        ],
        { env: composeCtx.composeEnv, extendEnv: true, stdio: "pipe", timeout: COMPOSE_DOWN_TIMEOUT_MS },
      );
      log(`[rollback] compose cleanup completed project=${composeCtx.project}`);
    } catch (cleanupErr) {
      log(
        `[rollback] compose cleanup failed: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
        }`,
      );
    }
  }

  const journalState = await loadProvisionJournalState(db, correlationId);
  if (journalState.completedOps.has("pos.schema_migration")) {
    log("[rollback] pos.schema_migration completed — POS compose down + Mongo deprovision will revert schema state");
  }
  if (rollbackSlug && journalState.completedOps.has("docker.data_step")) {
    const cleanupResult = await deprovisionTenantDatabases(rollbackSlug, log);
    const cleanupComplete =
      cleanupResult.mysqlDbs && cleanupResult.mongoDb && cleanupResult.redisKeys;
    if (cleanupComplete) {
      log(`[rollback] shared DB teardown completed for slug=${rollbackSlug}`);
    } else {
      log(
        JSON.stringify({
          level: "warn",
          event: "rollback_incomplete",
          cleanupResult,
          slug: rollbackSlug,
          reason: trimmedReason,
        }),
      );
      await db
        .insert(tenantProvisionEvents)
        .values({
          correlationId,
          tenantId,
          phase: "rollback",
          level: "warn",
          message: "rollback_incomplete",
          meta: {
            operationKey: "rollback_incomplete",
            cleanupResult,
            slug: rollbackSlug,
            reason: trimmedReason,
          },
        })
        .catch((error) => {
          log(
            `[rollback] rollback_incomplete event insert failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }
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
        `[rollback] provision event insert failed: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    });

  log(`[rollback] tenant=${tenantId} correlationId=${correlationId} reason=${trimmedReason}`);
}

/** Module-add failure — restore active tenant without tearing down existing stacks. */
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

async function resolvePublishedServerHostPort(containerName: string): Promise<number | null> {
  // Prefer `docker port` — reliable on Windows; complex inspect templates often fail under PowerShell.
  try {
    const { stdout } = await execa("docker", ["port", containerName, "3000"], { stdio: "pipe" });
    const match = stdout.trim().match(/:(\d+)\s*$/);
    if (match?.[1]) {
      const port = Number(match[1]);
      if (Number.isFinite(port) && port > 0) return port;
    }
  } catch {
    // Fall through to inspect.
  }
  try {
    const { stdout } = await execa(
      "docker",
      [
        "inspect",
        "--format",
        "{{(index (index .NetworkSettings.Ports \"3000/tcp\") 0).HostPort}}",
        containerName,
      ],
      { stdio: "pipe" },
    );
    const port = Number(stdout.trim());
    if (Number.isFinite(port) && port > 0) return port;
  } catch {
    // Fall through to compose port lookup.
  }
  return null;
}

async function resolveServerInternalUrl(params: {
  composeFile: string;
  project: string;
  envPath: string;
  composeEnv: Record<string, string>;
  fallbackHost: string;
  fallbackPort: number;
  log?: (message: string) => void;
}): Promise<string> {
  // Connect the tenant server container to the worker's internal network so the
  // worker can reach it directly (host-published port forwarding is blocked by
  // Docker isolation between different bridge networks on Linux).
  const workerNetwork = process.env.WORKER_INTERNAL_NETWORK ?? "stockix_internal";
  const containerName = `${params.project}-server-1`;
  try {
    await execa("docker", ["network", "connect", workerNetwork, containerName], {
      stdio: "pipe",
      reject: false,
    });
    const { stdout: inspectOut } = await execa(
      "docker",
      [
        "inspect",
        "--format",
        `{{(index .NetworkSettings.Networks "${workerNetwork}").IPAddress}}`,
        containerName,
      ],
      { stdio: "pipe" },
    );
    const ip = inspectOut.trim();
    if (ip && ip !== "<no value>" && ip !== "") {
      return `http://${ip}:3000`;
    }
  } catch {
    // Fall through to host-port approach.
  }

  const publishedPort = await resolvePublishedServerHostPort(containerName);
  if (publishedPort) {
    params.log?.(
      `[provision] resolved Finance server published port ${publishedPort} for ${containerName}`,
    );
    return `http://${params.fallbackHost}:${publishedPort}`;
  }

  try {
    const { stdout } = await execa(
      "docker",
      [
        "compose",
        "-f",
        params.composeFile,
        "-p",
        params.project,
        "--env-file",
        params.envPath,
        "port",
        "server",
        "3000",
      ],
      { env: params.composeEnv, extendEnv: true, stdio: "pipe" },
    );
    const trimmed = stdout.trim();
    const match = trimmed.match(/:(\d+)\s*$/);
    if (match?.[1]) {
      const composePort = Number(match[1]);
      params.log?.(
        `[provision] resolved Finance server compose port ${composePort} for ${params.project}`,
      );
      return `http://${params.fallbackHost}:${composePort}`;
    }
  } catch {
    // Fall through to last-resort fallback.
  }

  params.log?.(
    `[provision][warn] could not resolve published server port for ${containerName}; ` +
      `falling back to ${params.fallbackHost}:${params.fallbackPort} (PUBLIC_PROXY_PORT — likely wrong for health check)`,
  );
  return `http://${params.fallbackHost}:${params.fallbackPort}`;
}

async function guardNoConcurrentProvision(
  db: PostgresJsDatabase<typeof dbSchema>,
  tenantId: string | undefined,
  lifecycleJobId: string | undefined,
): Promise<void> {
  if (!tenantId || !lifecycleJobId) return;
  // Concurrent provision guard — prevents duplicate compose/DB ops
  // for same tenant. See provision-lock.ts for implementation.
  await assertNoConcurrentTenantLifecycleJob(db, tenantId, lifecycleJobId);
}

export async function executeProvisionRuntime(
  deps: TenantProvisionServiceDeps,
  db: PostgresJsDatabase<typeof dbSchema>,
  input: ProvisionInput,
  log: (m: string) => void,
  correlationId: string,
  assertNotCancelled?: () => Promise<void>,
  lifecycleJobId?: string,
): Promise<ProvisionResult> {
  const runtimeStartedAt = Date.now();
  let tenantId: string | undefined;
  let deploymentId: string | undefined;
  const trace = createProvisionTracer(
    db,
    correlationId,
    () => ({
      slug: input.slug,
      tenantId,
      deploymentId,
      parentTenantId: input.stockixTenantId ?? null,
    }),
    log,
  );
  const { tenantComposeFile: composeFile, stockixFinanceRoot } = getTenantStackPaths();
  const rootDomain = apiConfig.rootDomain || "example.com";
  const publicScheme = apiConfig.publicBaseUrlScheme;
  const maxPort = apiConfig.maxTenantPort;
  const tenantEnvRoot = defaultTenantEnvRoot();
  const project = composeProjectName(input.slug);
  const baseUrl = `${publicScheme}://${input.slug}.${rootDomain}`;
  const requestId = correlationId;
  let port: number | undefined;
  let oneTimeAdminPassword: string | undefined;
  let financeOrganizationId: string | undefined;
  let bootstrapFinanceOrganizationId: string | undefined;
  let financeTenantId: number | undefined;
  let financeDefaultWarehouseId: number | undefined;
  let walkInCustomerId: number | undefined;
  let cashAccountId: number | undefined;
  let cardAccountId: number | undefined;
  let serviceChargeItemId: number | undefined;
  let discountItemId: number | undefined;
  let defaultVendorId: number | undefined;
  let inventoryAccountId: number | undefined;
  let inventoryVarianceAccountId: number | undefined;
  let posOrganizationId: string | undefined;
  let posUrl: string | undefined;
  let posApiUrl: string | undefined;
  let posDefaultCredentials:
    | import("../domain/provisioning/types.js").PosDefaultCredentials
    | undefined;
  let composeCtx:
    | { composeFile: string; project: string; envPath: string; composeEnv: Record<string, string> }
    | null = null;
  let sideEffectsStarted = false;
  const journalState = await loadProvisionJournalState(db, correlationId);
  const completedOps = journalState.completedOps;
  if (journalState.financeTenantId) financeTenantId = journalState.financeTenantId;
  if (journalState.financeOrganizationId) financeOrganizationId = journalState.financeOrganizationId;
  if (journalState.financeDefaultWarehouseId) financeDefaultWarehouseId = journalState.financeDefaultWarehouseId;
  if (journalState.walkInCustomerId) walkInCustomerId = journalState.walkInCustomerId;
  if (journalState.cashAccountId) cashAccountId = journalState.cashAccountId;
  if (journalState.cardAccountId) cardAccountId = journalState.cardAccountId;
  if (journalState.serviceChargeItemId) {
    serviceChargeItemId = journalState.serviceChargeItemId;
  }
  if (journalState.discountItemId) discountItemId = journalState.discountItemId;
  const checkNotCancelled = async () => {
    if (!assertNotCancelled) return;
    await assertNotCancelled();
  };
  const runComposeWithCancellation = async (
    args: string[],
  ): Promise<void> => {
    const executeCompose = async () => {
      log(`[compose] starting: docker compose ${args.join(" ")}`);
      const controller = new AbortController();
      const intervalId = setInterval(() => {
        checkNotCancelled().catch((error) => {
          if (!controller.signal.aborted) {
            log(
              `[compose] cancellation requested during ${args.join(" ")}: ${error instanceof Error ? error.message : String(error)
              }`,
            );
            controller.abort(error);
          }
        });
      }, 1000);
      try {
        const timeoutMs = resolveComposeStepTimeoutMs(args);
        let lastComposeTraceAt = 0;
        await deps.docker.run(
          composeCtx!.composeFile,
          composeCtx!.project,
          composeCtx!.envPath,
          composeCtx!.composeEnv,
          args,
          {
            cancelSignal: controller.signal,
            timeoutMs,
            onOutput: (chunk) => {
              const now = Date.now();
              if (now - lastComposeTraceAt < 4_000) return;
              const line = chunk
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
                .pop();
              if (!line) return;
              if (!/pull|download|build|creating|starting|started|healthy/i.test(line)) return;
              lastComposeTraceAt = now;
              void trace.event("compose", redactComposeLogLine(line).slice(0, 240), {
                level: "info",
              });
            },
          },
        );
        log(`[compose] completed: docker compose ${args.join(" ")}`);
        await checkNotCancelled();
      } catch (error) {
        log(
          `[compose] failed: docker compose ${args.join(" ")} :: ${error instanceof Error ? error.message : String(error)
          }`,
        );
        if (controller.signal.aborted) {
          const reason = controller.signal.reason;
          if (reason instanceof Error) {
            throw reason;
          }
          throw new Error(typeof reason === "string" ? reason : "cancelled_by_user");
        }
        throw error;
      } finally {
        clearInterval(intervalId);
      }
    };
    if (tenantId) {
      await withTenantLifecycleAdvisoryLock(db, tenantId, executeCompose);
    } else {
      await executeCompose();
    }
  };
  const hasOp = (key: string) => completedOps.has(key);
  const elapsedMs = () => Date.now() - runtimeStartedAt;
  const markOp = async (operationKey: string, message: string, meta?: Record<string, unknown>) => {
    completedOps.add(operationKey);
    await trace.event("journal", message, {
      meta: {
        operationKey,
        ...meta,
      },
    });
  };
  const recordCleanupError = async (step: string, error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    try {
      await trace.event("cleanup", `non-fatal error in ${step}: ${msg}`, {
        level: "error",
        meta: { step, error: msg },
      });
    } catch {
      // last-resort logging only
      console.error(`[provision][${correlationId}] cleanup log failure step=${step}: ${msg}`);
    }
  };
  try {
    log(`[provision] start slug=${input.slug} correlationId=${correlationId}`);
    await checkNotCancelled();
    await mkdir(join(stockixFinanceRoot, "data/logs/nginx"), { recursive: true });
    await mkdir(join(stockixFinanceRoot, "docker/certbot/certs"), { recursive: true });

    const { secrets } = deps;
    // Same admin email for all orgs under a tenant; password must match the parent stack's
    // bootstrap key so operators can sign in everywhere. Sub-org jobs set parentTenantSlug.
    const bootstrapPasswordKey =
      input.parentTenantSlug?.trim() || input.slug.trim();
    oneTimeAdminPassword = resolveOneTimeAdminPassword(secrets, bootstrapPasswordKey);
    let jwtSecret = secrets.persistSecret(secrets.randomHex(32));
    let dbPasswordPlain = secrets.randomHex(16);
    let dbPassword = secrets.persistSecret(dbPasswordPlain);
    let dbRootPasswordPlain = secrets.randomHex(16);
    let dbRootPassword = secrets.persistSecret(dbRootPasswordPlain);
    const mongoUrlPersisted = buildTenantMongoUrl(input.slug);
    const agendashUser = "agendash";
    const agendashPassword = secrets.persistSecret(secrets.randomHex(12));
    // S3 (Backblaze B2 / MinIO) is optional — empty values skip object storage; attachments need B2 in tenant .env.
    const optionalEnv = (name: string) => process.env[name]?.trim() ?? "";
    const s3Region = optionalEnv("S3_REGION") || "us-east-1";
    const s3AccessKeyId = optionalEnv("S3_ACCESS_KEY_ID");
    const s3SecretAccessKey = optionalEnv("S3_SECRET_ACCESS_KEY");
    const s3Endpoint = optionalEnv("S3_ENDPOINT");
    const s3Bucket = optionalEnv("S3_BUCKET");
    const s3ForcePathStyle = optionalEnv("S3_FORCE_PATH_STYLE") || "true";
    const s3Configured =
      s3AccessKeyId.length > 0 &&
      s3SecretAccessKey.length > 0 &&
      s3Endpoint.length > 0 &&
      s3Bucket.length > 0;
    if (!s3Configured) {
      log("[provision] S3 not configured — provisioning without object storage (attachments disabled).");
    }
    const licensedModulesEarly = resolveTenantModules(input.modules);
    assertProvisionModuleEnv(licensedModulesEarly);
    const posOnlyRetry =
      input.retryModules?.length === 1 && input.retryModules[0] === "pos";
    const wireOnlyRetry =
      input.retryModules?.length === 1 && input.retryModules[0] === "wire";

    if (wireOnlyRetry) {
      const [existing] = await db
        .select({
          tenantId: tenants.id,
          tenantModules: tenants.modules,
          deploymentId: tenantDeployments.id,
          internalPort: tenantDeployments.internalPort,
          composeProjectName: tenantDeployments.composeProjectName,
          financeTenantId: tenantDeployments.financeTenantId,
          financeDefaultWarehouseId: tenantDeployments.financeDefaultWarehouseId,
          financeWalkInCustomerId: tenantDeployments.financeWalkInCustomerId,
          financeCashAccountId: tenantDeployments.financeCashAccountId,
          financeCardAccountId: tenantDeployments.financeCardAccountId,
          posOrganizationId: tenantDeployments.posOrganizationId,
          posUrl: tenantDeployments.posUrl,
        })
        .from(tenants)
        .innerJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
        .where(eq(tenants.slug, input.slug))
        .limit(1);
      if (!existing) {
        throw new Error(`tenant_not_found:${input.slug}`);
      }
      tenantId = existing.tenantId;
      deploymentId = existing.deploymentId;
      port = existing.internalPort;
      await guardNoConcurrentProvision(db, tenantId, lifecycleJobId);
      const retryLicensedModules = resolveTenantModules(
        parseTenantModulesJson(existing.tenantModules),
      );
      if (!hasAccountingAndPos(retryLicensedModules)) {
        throw new Error("wire_only_retry_requires_accounting_and_pos_modules");
      }
      const posOrgId = existing.posOrganizationId?.trim();
      const posHostPort = await resolvePosBackendHostPort(input.slug);
      if (
        !posOrgId
        || !posHostPort
        || !existing.financeTenantId
        || existing.financeTenantId <= 0
        || !existing.financeWalkInCustomerId
        || !port
        || !existing.financeCashAccountId
        || !existing.financeCardAccountId
      ) {
        throw new Error("wire_only_retry_missing_prerequisites");
      }
      await checkNotCancelled();
      const workerInternalUrl =
        port > 0
          ? `http://${process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? apiConfig.tenantInternalHost ?? "127.0.0.1"}:${port}`
          : undefined;
      let retryServiceChargeItemId: number | undefined;
      let retryDiscountItemId: number | undefined;
      const internalApiSecret = apiConfig.internalApiSecret?.trim() ?? "";
      if (workerInternalUrl && internalApiSecret) {
        try {
          const seeded = await seedFinancePosDefaults({
            internalBaseUrl: workerInternalUrl,
            internalApiSecret,
            financeTenantId: existing.financeTenantId,
            correlationId,
            log,
          });
          retryServiceChargeItemId = seeded.serviceChargeItemId;
          retryDiscountItemId = seeded.discountItemId;
        } catch (seedErr) {
          const seedMsg = seedErr instanceof Error ? seedErr.message : String(seedErr);
          log(`[provision][pos] bridge item seed skipped on wire retry: ${seedMsg}`);
        }
      }
      const wireResult = await runWirePosIntegrationStep({
        licensedModules: retryLicensedModules,
        slug: input.slug,
        posOrganizationId: posOrgId,
        posHostPort,
        financeInternalPort: port,
        workerInternalUrl,
        financeTenantId: existing.financeTenantId,
        walkInCustomerId: existing.financeWalkInCustomerId,
        cashAccountId: existing.financeCashAccountId,
        cardAccountId: existing.financeCardAccountId,
        serviceChargeItemId: retryServiceChargeItemId,
        discountItemId: retryDiscountItemId,
        financeDefaultWarehouseId: existing.financeDefaultWarehouseId ?? undefined,
        log,
        trace,
        markOp,
        hasOp,
        forceRerun: true,
      });
      if (!wireResult.ok) {
        await markTenantPartial(db, {
          tenantId,
          kind: "wire_failed",
          lastError: wireResult.error,
        });
        return {
          ok: true,
          tenantId,
          deploymentId,
          composeProjectName: existing.composeProjectName,
          internalPort: port,
          baseUrl: `${publicScheme}://${input.slug}.${rootDomain}`,
          oneTimeAdminPassword: oneTimeAdminPassword!,
          posStatus: "ok",
          posError: wireResult.error,
          tenantStatus: "partial",
          posOrganizationId: posOrgId,
          posUrl: existing.posUrl ?? undefined,
        };
      }
      await clearTenantPartialState(db, tenantId, "active");
      log(`[provision] Wire-only retry success slug=${input.slug}`);
      return {
        ok: true,
        tenantId,
        deploymentId,
        composeProjectName: existing.composeProjectName,
        internalPort: port,
        baseUrl: `${publicScheme}://${input.slug}.${rootDomain}`,
        oneTimeAdminPassword: oneTimeAdminPassword!,
        posStatus: "ok",
        tenantStatus: "active",
        posOrganizationId: posOrgId,
        posUrl: existing.posUrl ?? undefined,
      };
    }

    if (posOnlyRetry) {
      const [existing] = await db
        .select({
          tenantId: tenants.id,
          tenantModules: tenants.modules,
          deploymentId: tenantDeployments.id,
          internalPort: tenantDeployments.internalPort,
          composeProjectName: tenantDeployments.composeProjectName,
          financeTenantId: tenantDeployments.financeTenantId,
          financeDefaultWarehouseId: tenantDeployments.financeDefaultWarehouseId,
          financeWalkInCustomerId: tenantDeployments.financeWalkInCustomerId,
          financeCashAccountId: tenantDeployments.financeCashAccountId,
          financeCardAccountId: tenantDeployments.financeCardAccountId,
          posOrganizationId: tenantDeployments.posOrganizationId,
          posUrl: tenantDeployments.posUrl,
        })
        .from(tenants)
        .innerJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
        .where(eq(tenants.slug, input.slug))
        .limit(1);
      if (!existing) {
        throw new Error(`tenant_not_found:${input.slug}`);
      }
      tenantId = existing.tenantId;
      deploymentId = existing.deploymentId;
      port = existing.internalPort;
      await guardNoConcurrentProvision(db, tenantId, lifecycleJobId);
      const retryLicensedModules = resolveTenantModules(
        parseTenantModulesJson(existing.tenantModules),
      );
      await checkNotCancelled();
      const posOutcome = await runPosProvisionStep({
        licensedModules: retryLicensedModules,
        slug: input.slug,
        tenantId,
        tenantName: input.name,
        adminEmail: input.adminEmail,
        planSlug: input.planSlug,
        financeInternalPort: port,
        db,
        log,
        trace,
        hasOp,
        markOp,
        posOrganizationId: existing.posOrganizationId ?? undefined,
        posUrl: existing.posUrl ?? undefined,
      });
      if (posOutcome.posStatus === "ok") {
        let tenantStatus: "active" | "partial" = "active";
        let wireError: string | undefined;
        const shouldWire =
          hasAccountingAndPos(retryLicensedModules)
          && existing.financeTenantId != null
          && existing.financeTenantId > 0
          && existing.financeWalkInCustomerId != null
          && existing.financeWalkInCustomerId > 0;

        if (
          shouldWire
          && posOutcome.posOrganizationId
          && posOutcome.posHostPort
          && port
          && existing.financeCashAccountId
          && existing.financeCashAccountId > 0
          && existing.financeCardAccountId
          && existing.financeCardAccountId > 0
        ) {
          const workerInternalUrl =
            port > 0
              ? `http://${process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? apiConfig.tenantInternalHost ?? "127.0.0.1"}:${port}`
              : undefined;
          let retryServiceChargeItemId: number | undefined;
          let retryDiscountItemId: number | undefined;
          const internalApiSecret = apiConfig.internalApiSecret?.trim() ?? "";
          if (workerInternalUrl && internalApiSecret) {
            try {
              const seeded = await seedFinancePosDefaults({
                internalBaseUrl: workerInternalUrl,
                internalApiSecret,
                financeTenantId: existing.financeTenantId!,
                correlationId,
                log,
              });
              retryServiceChargeItemId = seeded.serviceChargeItemId;
              retryDiscountItemId = seeded.discountItemId;
            } catch (seedErr) {
              const seedMsg =
                seedErr instanceof Error ? seedErr.message : String(seedErr);
              log(`[provision][pos] bridge item seed skipped on retry: ${seedMsg}`);
            }
          }
          const wireResult = await runWirePosIntegrationStep({
            licensedModules: retryLicensedModules,
            slug: input.slug,
            posOrganizationId: posOutcome.posOrganizationId,
            posHostPort: posOutcome.posHostPort,
            financeInternalPort: port,
            workerInternalUrl,
            financeTenantId: existing.financeTenantId!,
            walkInCustomerId: existing.financeWalkInCustomerId!,
            cashAccountId: existing.financeCashAccountId!,
            cardAccountId: existing.financeCardAccountId!,
            serviceChargeItemId: retryServiceChargeItemId,
            discountItemId: retryDiscountItemId,
            financeDefaultWarehouseId: existing.financeDefaultWarehouseId ?? undefined,
            log,
            trace,
            markOp,
            hasOp,
            forceRerun: true,
          });
          if (!wireResult.ok) {
            tenantStatus = "partial";
            wireError = wireResult.error;
            await markTenantPartial(db, {
              tenantId,
              kind: "wire_failed",
              lastError: wireError,
            });
          } else {
            await clearTenantPartialState(db, tenantId, "active");
            await trace.event("progress", "Integration re-wired on retry", {
              meta: { operationKey: "tenant.wire_pos_integration" },
            });
          }
        } else if (tenantStatus === "active") {
          await clearTenantPartialState(db, tenantId, "active");
        }

        await db
          .update(tenantDeployments)
          .set({
            status: "active",
            ...(wireError ? {} : { lastError: null, partialFailureKind: null }),
            updatedAt: new Date(),
            ...(posOutcome.posOrganizationId
              ? { posOrganizationId: posOutcome.posOrganizationId }
              : {}),
            ...(posOutcome.posUrl ? { posUrl: posOutcome.posUrl } : {}),
          })
          .where(eq(tenantDeployments.tenantId, tenantId));
        if (tenantStatus === "partial" && !wireError) {
          await db.update(tenants).set({ status: "partial" }).where(eq(tenants.id, tenantId));
        }
        log(`[provision] POS-only retry success slug=${input.slug}`);
        return {
          ok: true,
          tenantId,
          deploymentId,
          composeProjectName: existing.composeProjectName,
          internalPort: port,
          baseUrl: `${publicScheme}://${input.slug}.${rootDomain}`,
          oneTimeAdminPassword: oneTimeAdminPassword!,
          posStatus: "ok",
          tenantStatus,
          posOrganizationId: posOutcome.posOrganizationId,
          posUrl: posOutcome.posUrl,
          posApiUrl: posOutcome.posApiUrl,
          posDefaultCredentials: posOutcome.posDefaultCredentials,
          ...(wireError ? { posError: wireError } : {}),
        };
      }
      const posError = posOutcome.posError ?? "POS provisioning failed";
      await markTenantPartial(db, {
        tenantId,
        kind: "pos_failed",
        lastError: posError,
      });
      return {
        ok: false,
        message: posError,
      };
    }

    let organizationNumber: string | undefined;
    if (input.skipTenantCreation) {
      const existingTenantId = input.existingTenantId?.trim();
      if (!existingTenantId) {
        throw new Error("skipTenantCreation_requires_existingTenantId");
      }
      const [existing] = await db
        .select({
          tenantId: tenants.id,
          slug: tenants.slug,
          deploymentId: tenantDeployments.id,
          internalPort: tenantDeployments.internalPort,
          composeProjectName: tenantDeployments.composeProjectName,
          organizationNumber: tenants.organizationNumber,
          mysqlPassword: tenantDeployments.mysqlPassword,
          mysqlRootPassword: tenantDeployments.mysqlRootPassword,
          jwtSecret: tenantDeployments.jwtSecret,
        })
        .from(tenants)
        .innerJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
        .where(eq(tenants.id, existingTenantId))
        .limit(1);
      if (!existing) {
        throw new Error(`tenant_not_found:${existingTenantId}`);
      }
      tenantId = existing.tenantId;
      deploymentId = existing.deploymentId;
      port = existing.internalPort;
      organizationNumber = existing.organizationNumber ?? undefined;
      if (!organizationNumber) {
        organizationNumber = await allocateOrganizationNumber(db);
        await db
          .update(tenants)
          .set({ organizationNumber })
          .where(eq(tenants.id, tenantId));
      }
      dbPasswordPlain = decryptDeploymentSecretLocal(existing.mysqlPassword);
      dbPassword = existing.mysqlPassword;
      dbRootPasswordPlain = decryptDeploymentSecretLocal(existing.mysqlRootPassword);
      dbRootPassword = existing.mysqlRootPassword;
      jwtSecret = decryptDeploymentSecretLocal(existing.jwtSecret);
      await db
        .update(tenants)
        .set({ status: "provisioning" })
        .where(eq(tenants.id, tenantId));
      await db
        .update(tenantDeployments)
        .set({ status: "provisioning", lastError: null, updatedAt: new Date() })
        .where(eq(tenantDeployments.id, deploymentId));
      log(`[provision] add-module finance stack for existing tenant=${tenantId} slug=${existing.slug}`);
    } else {
      const existingSlug = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, input.slug))
        .limit(1);
      if (existingSlug.length > 0) {
        throw new Error(`tenant_slug_exists:${input.slug}`);
      }
      organizationNumber = await allocateOrganizationNumber(db);

      await db.transaction(async (tx) => {
        const allocated = await allocateTenantPort(tx, maxPort);
        port = allocated;
        const moduleList = resolveTenantModules(input.modules);
        const [tRow] = await tx.insert(tenants).values({
          slug: input.slug,
          name: input.name,
          ownerId: input.ownerId,
          adminEmail: input.adminEmail,
          adminFirstName: input.adminFirstName,
          adminLastName: input.adminLastName,
          status: "provisioning",
          planSlug: input.planSlug ?? "starter",
          modules: JSON.stringify(moduleList),
          organizationNumber,
        }).returning({ id: tenants.id });
        tenantId = tRow!.id;
        const [dRow] = await tx.insert(tenantDeployments).values({
          tenantId,
          status: "provisioning",
          composeProjectName: project,
          internalPort: allocated,
          mysqlPassword: encryptDeploymentSecretLocal(dbPassword),
          mysqlRootPassword: encryptDeploymentSecretLocal(dbRootPassword),
          jwtSecret: encryptDeploymentSecretLocal(jwtSecret),
          mongoUrl: mongoUrlPersisted,
        }).returning({ id: tenantDeployments.id });
        deploymentId = dRow!.id;
      });
    }
    if (port === undefined) {
      throw new Error("provision_internal: expected allocated port after transaction");
    }
    await guardNoConcurrentProvision(db, tenantId, lifecycleJobId);
    await checkNotCancelled();

    const licensedModules = resolveTenantModules(input.modules);
    const moduleGating = isModuleGatingEnabled();
    if (moduleGating && !shouldProvisionFinanceStack(licensedModules)) {
      log(`[provision] module gating: skipping Finance stack (modules=${licensedModules.join(",")})`);
      const posOnlyTenantEnvMap = buildTenantEnvMap({
        slug: input.slug,
        stockixFinanceRoot,
        baseUrl,
        socketAllowedOrigins: baseUrl,
        jwtSecret,
        dbPassword: dbPasswordPlain,
        dbRootPassword: dbRootPasswordPlain,
        publicProxyPort: port,
        adminEmail: input.adminEmail,
        agendashUser,
        agendashPassword,
        s3Region,
        s3AccessKeyId,
        s3SecretAccessKey,
        s3Endpoint,
        s3Bucket,
        s3ForcePathStyle,
        stockixTenantId: tenantId ?? input.stockixTenantId,
        stockixDiscoverySlug: input.slug,
        stockixApiUrl: `${baseUrl}/api`,
        internalApiSecret: apiConfig.internalApiSecret,
        stockixAppName: input.name,
        stockixLogoUrl: "",
        stockixPrimaryColor: "#ca8a04",
      });
      await writeTenantEnvFileAtomic(join(tenantEnvRoot, input.slug), posOnlyTenantEnvMap);
      log(`[provision] POS-only path: tenant .env written before POS stack`);
      const posOutcome = await runPosProvisionStep({
        licensedModules,
        slug: input.slug,
        tenantId,
        tenantName: input.name,
        adminEmail: input.adminEmail,
        planSlug: input.planSlug,
        financeInternalPort: port,
        db,
        log,
        trace,
        hasOp,
        markOp,
        posOrganizationId,
        posUrl,
        posApiUrl,
      });
      if (posOutcome.posStatus === "failed") {
        const posError = posOutcome.posError ?? "POS provisioning failed";
        if (tenantId) {
          await rollbackProvision(db, tenantId, correlationId, posError, {
            deps,
            log,
          });
        }
        throw new Error(posError);
      }
      if (posOutcome.posStatus === "ok") {
        posOrganizationId = posOutcome.posOrganizationId;
        posUrl = posOutcome.posUrl;
        posApiUrl = posOutcome.posApiUrl;
        posDefaultCredentials = posOutcome.posDefaultCredentials;
      }
      if (licensedModules.includes("pms") && tenantId) {
        await provisionPmsStack({ slug: input.slug, tenantId, log });
      }
      if (licensedModules.includes("chat") && tenantId) {
        await provisionChatwootAccount({
          db,
          tenantId,
          tenantName: input.name,
          adminEmail: input.adminEmail,
          chatwootBaseUrl: process.env.CHATWOOT_BASE_URL ?? "",
          chatwootApiKey: process.env.CHATWOOT_API_ACCESS_TOKEN ?? "",
          log,
        });
      }
      await db.update(tenants).set({ status: "active" }).where(eq(tenants.id, tenantId!));
      await db
        .update(tenantDeployments)
        .set({ status: "active", lastError: null, updatedAt: new Date() })
        .where(eq(tenantDeployments.tenantId, tenantId!));
      return {
        ok: true,
        tenantId: tenantId!,
        deploymentId: deploymentId!,
        composeProjectName: project,
        internalPort: port,
        baseUrl,
        oneTimeAdminPassword: oneTimeAdminPassword ?? randomBytes(12).toString("base64url"),
        financeOrganizationId,
        financeTenantId,
        financeDefaultWarehouseId,
        posOrganizationId,
        posUrl,
        posApiUrl,
        posDefaultCredentials,
        posStatus: posOutcome.posStatus === "ok" ? "ok" : "skipped",
      };
    }

    let stockixAppName = input.name;
    let stockixLogoUrl = "";
    let stockixPrimaryColor = "#ca8a04";
    let stockixDiscoverySlug = "";
    if (tenantId) {
      const [cfg] = await db
        .select({
          appName: tenantConfig.appName,
          logoUrl: tenantConfig.logoUrl,
          primaryColor: tenantConfig.primaryColor,
          publicDiscoverySlug: tenantConfig.publicDiscoverySlug,
        })
        .from(tenantConfig)
        .where(eq(tenantConfig.tenantId, tenantId))
        .limit(1);
      if (cfg) {
        stockixAppName = cfg.appName ?? stockixAppName;
        stockixLogoUrl = cfg.logoUrl ?? "";
        stockixPrimaryColor = cfg.primaryColor ?? stockixPrimaryColor;
        stockixDiscoverySlug = cfg.publicDiscoverySlug ?? "";
      }
    }

    const tenantEnvMap = buildTenantEnvMap({
      slug: input.slug,
      stockixFinanceRoot,
      baseUrl,
      socketAllowedOrigins: baseUrl,
      jwtSecret,
      dbPassword: dbPasswordPlain,
      dbRootPassword: dbRootPasswordPlain,
      publicProxyPort: port,
      adminEmail: input.adminEmail,
      agendashUser,
      agendashPassword,
      s3Region,
      s3AccessKeyId,
      s3SecretAccessKey,
      s3Endpoint,
      s3Bucket,
      s3ForcePathStyle,
      stockixTenantId: tenantId ?? input.stockixTenantId,
      stockixDiscoverySlug: stockixDiscoverySlug || input.slug,
      stockixApiUrl: `${baseUrl}/api`,
      internalApiSecret: apiConfig.internalApiSecret,
      stockixAppName,
      stockixLogoUrl,
      stockixPrimaryColor,
    });
    const envPath = await writeTenantEnvFileAtomic(join(tenantEnvRoot, input.slug), tenantEnvMap);
    if (!tenantEnvMap.MAIL_PASSWORD?.trim() || !tenantEnvMap.MAIL_FROM_ADDRESS?.trim()) {
      log(
        "[provision][mail] tenant .env missing MAIL_PASSWORD or MAIL_FROM_ADDRESS — Finance invite/reset emails will not send",
      );
      await trace.event(
        "mail.env_incomplete",
        "Tenant mail env incomplete (MAIL_PASSWORD or MAIL_FROM_ADDRESS missing)",
        { level: "warn" },
      );
    }
    const composeEnv = {
      ...tenantEnvMap,
      COMPOSE_PROJECT_NAME: project,
    };
    composeCtx = { composeFile, project, envPath, composeEnv };
    const { docker, finance, edge } = deps;
    await assertRequiredTenantImages();
    await ensureTenantExternalNetworks(log);
    await checkNotCancelled();
    const staleContainersRaw = await execa(
      "docker",
      ["ps", "-a", "--filter", `name=${project}`, "--format", "{{.Names}}"],
      { stdio: "pipe" },
    )
      .then(({ stdout }) => stdout)
      .catch(() => "");
    const staleContainers = staleContainersRaw
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    if (staleContainers.length > 0) {
      await trace.event("preflight.cleanup", "Detected stale project containers before provision", {
        level: "warn",
        meta: { composeProjectName: project, staleContainers },
      });
    }
    await docker
      .run(
        composeCtx.composeFile,
        composeCtx.project,
        composeCtx.envPath,
        composeCtx.composeEnv,
        buildPreflightDownArgs(input.cleanSlate === true),
        { timeoutMs: COMPOSE_DOWN_TIMEOUT_MS },
      )
      .catch(() => undefined);
    await trace.event("preflight.cleanup", "completed", {
      meta: { composeProjectName: project },
    });
    sideEffectsStarted = true;
    await checkNotCancelled();
    if (!hasOp("docker.data_step")) {
      log("[provision] step start: docker.data_step");
      const { provisionTenantDatabases } = await import("../domain/provisioner.js");
      await provisionTenantDatabases(input.slug, dbPasswordPlain, log);
      await markOp("docker.data_step", "Tenant databases provisioned on shared infra", {
        composeProjectName: project,
      });
      log("[provision] step done: docker.data_step");
    } else {
      await trace.event("resume", "Skipping data step (already journaled)", {
        meta: { operationKey: "docker.data_step", composeProjectName: project },
      });
    }


    await checkNotCancelled();
    if (!hasOp("docker.migration_step")) {
      log("[provision] step start: docker.migration_step");
      const { resetSystemDatabaseForMigration } = await import("../domain/provisioner.js");
      await resetSystemDatabaseForMigration(input.slug, dbPasswordPlain, log);
      await trace.event("progress", "Running Finance system database migrations", {
        meta: { operationKey: "docker.migration_step", composeProjectName: project },
      });
      log("database_migration");
      await runComposeWithCancellation(["run", "--rm", "database_migration"]);
      await markOp("docker.migration_step", "Migration compose step completed", {
        composeProjectName: project,
        elapsedMs: elapsedMs(),
      });
      await trace.event("progress", "Post-migration checkpoint reached", {
        meta: { operationKey: "docker.migration_step", elapsedMs: elapsedMs() },
      });
      log("[provision] step done: docker.migration_step");
    } else {
      await trace.event("resume", "Skipping migration step (already journaled)", {
        meta: { operationKey: "docker.migration_step", composeProjectName: project },
      });
    }
    await checkNotCancelled();
    if (!hasOp("docker.app_step")) {
      log("[provision] step start: docker.app_step");
      await trace.event("progress", "Starting app compose step", {
        meta: { operationKey: "docker.app_step", elapsedMs: elapsedMs() },
      });
      // Worker journals migration separately; --no-deps avoids double-run on resume.
      // compose depends_on protects manual `docker compose up server`.
      await runComposeWithCancellation([...TENANT_SERVER_UP_COMPOSE_ARGS]);
      await markOp("docker.app_step", "Application compose step completed", {
        composeProjectName: project,
        elapsedMs: elapsedMs(),
      });
      log("[provision] step done: docker.app_step");
    } else {
      await trace.event("resume", "Skipping app step (already journaled)", {
        meta: { operationKey: "docker.app_step", composeProjectName: project },
      });
    }
    await checkNotCancelled();

    // Finance webapp static assets are served by the Finance NestJS server itself
    // via ServeStaticModule (/public route) — no static copy to shared nginx volume needed.
    // Architecture2.md §5.4 — shared nginx is static-only CDN; Finance UI served by server.
    // K6 closed: ServeStaticModule confirmed in App.module.ts:115-117.

    // SECURITY NOTE: tenant server joins stockix_internal for bootstrap only.
    // Accepted risk — documented in Architecture2.md §16.
    // Future: use dedicated bootstrap network + disconnect after completion.
    // Connect the tenant server container to stockix_internal so the infra-worker can
    // reach it directly (host.docker.internal NAT is blocked by iptables on Linux).
    const serverContainerName = `${project}-server-1`;
    const internalNetworkName = process.env.STOCKIX_INTERNAL_NETWORK ?? "stockix_internal";
    let tenantServerInternalIp: string | undefined;
    let localDevFallback = false;
    if (!hasOp("docker.network_connect")) {
      try {
        await execa("docker", ["network", "connect", internalNetworkName, serverContainerName]);
        log(`[provision] connected ${serverContainerName} to ${internalNetworkName}`);
        const { stdout: inspectOut } = await execa("docker", [
          "inspect",
          serverContainerName,
          "--format",
          `{{(index .NetworkSettings.Networks "${internalNetworkName}").IPAddress}}`,
        ]);
        tenantServerInternalIp = inspectOut.trim();
        log(`[provision] tenant server internal IP: ${tenantServerInternalIp}`);
        await markOp("docker.network_connect", "Tenant server connected to internal network", {
          containerName: serverContainerName,
          network: internalNetworkName,
          ip: tenantServerInternalIp,
        });
      } catch (netErr) {
        const msg = netErr instanceof Error ? netErr.message : String(netErr);
        if (process.env.NODE_ENV !== "production") {
          localDevFallback = true;
          log(
            "[provision] stockix_internal unavailable in local dev — resolving published server port for host.docker.internal",
          );
        } else {
          log(`[provision][warn] could not connect tenant server to ${internalNetworkName}: ${msg} — falling back to host.docker.internal`);
        }
      }
    } else {
      log(`[provision] network connect already journaled — skipping`);
      await trace.event("resume", "Skipping network connect (already journaled)", {
        meta: { operationKey: "docker.network_connect" },
      });
    }

    // REPAIRED: local dev Finance URL when stockix_internal missing 2026-06-05
    // Use docker compose port lookup — PUBLIC_PROXY_PORT (internal_port) is nginx routing,
    // not the dynamic host port published by tenant-stack server (0.0.0.0::3000).
    const internalUrl = tenantServerInternalIp
      ? `http://${tenantServerInternalIp}:3000`
      : await resolveServerInternalUrl({
          composeFile,
          project,
          envPath: composeCtx.envPath,
          composeEnv: composeCtx.composeEnv,
          // Host-run worker (pnpm dev) reaches published ports via TENANT_INTERNAL_HOST (127.0.0.1).
          fallbackHost: apiConfig.tenantInternalHost,
          fallbackPort: port,
          log,
        });
    if (!hasOp("tenant.health_check")) {
      log("[provision] step start: tenant.health_check");
      await trace.event("progress", "Waiting for tenant health endpoint", {
        meta: { operationKey: "tenant.health_check", elapsedMs: elapsedMs(), internalUrl },
      });
      await finance.waitUntilReady(
        internalUrl,
        STOCKIX_FINANCE_HEALTH_TIMEOUT_MS,
        log,
        requestId,
        trace,
      );
      await markOp("tenant.health_check", "Tenant health check completed", { internalUrl, elapsedMs: elapsedMs() });
      log("[provision] step done: tenant.health_check");
    } else {
      await trace.event("resume", "Skipping health check (already journaled)", {
        meta: { operationKey: "tenant.health_check", internalUrl },
      });
    }
    await checkNotCancelled();
    if (!hasOp("edge.publish")) {
      log("[provision] step start: edge.publish");
      await assertTenantPortAvailable(db, port, {
        excludeTenantId: tenantId ?? undefined,
        slug: input.slug,
      });
      try {
        await edge.publish(input.slug, port, rootDomain, project);
      } catch (error) {
        await trace.event("edge", "Traefik edge publish failed", {
          level: "error",
          meta: {
            slug: input.slug,
            internalPort: port,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
      await markOp("edge.publish", "Traefik edge publish completed", {
        slug: input.slug,
        internalPort: port,
      });
      log("[provision] step done: edge.publish");
    } else {
      await trace.event("resume", "Skipping edge publish (already journaled)", {
        meta: { operationKey: "edge.publish", slug: input.slug, internalPort: port },
      });
    }
    await checkNotCancelled();
    if (!hasOp("tenant.bootstrap_admin")) {
      log("[provision] step start: tenant.bootstrap_admin");
      await trace.event("progress", "Starting bootstrap admin registration", {
        meta: { operationKey: "tenant.bootstrap_admin", elapsedMs: elapsedMs(), adminEmail: input.adminEmail },
      });
      const internalApiSecret = apiConfig.internalApiSecret;
      if (!internalApiSecret) {
        throw new Error(
          "INTERNAL_API_SECRET is required for bootstrap admin provisioning",
        );
      }
      const bootstrapResult = await finance.registerBootstrapAdmin({
        internalBaseUrl: internalUrl,
        internalApiSecret,
        firstName: input.adminFirstName,
        lastName: input.adminLastName,
        email: input.adminEmail,
        password: oneTimeAdminPassword,
        organizationNumber,
        log,
        requestId,
        trace,
      });
      financeTenantId = bootstrapResult.tenantId;
      bootstrapFinanceOrganizationId = bootstrapResult.organizationId;
      await persistFinanceDeploymentIds(db, deploymentId, {
        financeTenantId: bootstrapResult.tenantId,
      });
      await markOp("tenant.bootstrap_admin", "Tenant bootstrap admin registered", {
        internalBaseUrl: internalUrl,
        adminEmail: input.adminEmail,
        financeTenantId: bootstrapResult.tenantId,
        elapsedMs: elapsedMs(),
      });
      log("[provision] step done: tenant.bootstrap_admin");
    } else {
      await trace.event("resume", "Skipping bootstrap admin registration (already journaled)", {
        meta: { operationKey: "tenant.bootstrap_admin", adminEmail: input.adminEmail },
      });
      if (!financeTenantId && deploymentId) {
        const [deployRow] = await db
          .select({ financeTenantId: tenantDeployments.financeTenantId })
          .from(tenantDeployments)
          .where(eq(tenantDeployments.id, deploymentId))
          .limit(1);
        const fromDb = deployRow?.financeTenantId;
        if (fromDb != null && fromDb > 0) {
          financeTenantId = fromDb;
          log(`[provision] Restored financeTenantId=${financeTenantId} from tenant_deployments on resume`);
        }
      }
    }
    await checkNotCancelled();

    let inheritedSettings: OrgBuildSettings = {
      ...MENA_DEFAULTS,
      name: input.name,
    };

    if (input.parentTenantSlug?.trim()) {
      const mainBase = input.mainTenantInternalBaseUrl?.trim();
      if (!mainBase) {
        if (!hasOp("tenant.fetch_org_settings")) {
          log("[provision] step start: tenant.fetch_org_settings");
          log("[provision] No main tenant internal base URL; skipping settings fetch");
          await markOp("tenant.fetch_org_settings", "Skipped settings fetch (no main base URL)", {
            parentTenantSlug: input.parentTenantSlug,
          });
          log("[provision] step done: tenant.fetch_org_settings");
        }
      } else if (!hasOp("tenant.build_organization")) {
        log("[provision] step start: tenant.fetch_org_settings");
        try {
          const mainPassword = secrets.bootstrapAdminPassword(input.parentTenantSlug.trim());
          const fetched = await finance.fetchOrgSettings({
            mainInternalBaseUrl: mainBase,
            adminEmail: input.adminEmail,
            adminPassword: mainPassword,
            correlationId,
          });
          if (fetched) {
            inheritedSettings = { ...fetched, name: input.name };
            log("[provision] Using inherited settings from main org");
          } else {
            log("[provision] Main org not reachable or not built; using MENA defaults");
          }
          if (!hasOp("tenant.fetch_org_settings")) {
            await markOp("tenant.fetch_org_settings", "Org settings fetch completed", {
              inherited: Boolean(fetched),
            });
          } else {
            await trace.event("resume", "Refreshed org settings from main before build retry", {
              meta: { operationKey: "tenant.fetch_org_settings", inherited: Boolean(fetched) },
            });
          }
        } catch (err) {
          log(
            `[provision] Settings fetch failed, using defaults: ${err instanceof Error ? err.message : String(err)
            }`,
          );
          if (!hasOp("tenant.fetch_org_settings")) {
            await markOp("tenant.fetch_org_settings", "Org settings fetch failed; using defaults", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        log("[provision] step done: tenant.fetch_org_settings");
      } else if (hasOp("tenant.fetch_org_settings")) {
        await trace.event("resume", "Skipping org settings fetch (organization build already journaled)", {
          meta: { operationKey: "tenant.fetch_org_settings" },
        });
      }
    }

    await checkNotCancelled();
    if (!hasOp("tenant.build_organization")) {
      log("[provision] step start: tenant.build_organization");
      await trace.event("progress", "Building organization database and seeding defaults", {
        meta: { operationKey: "tenant.build_organization", elapsedMs: elapsedMs() },
      });
      try {
        // The Finance API enforces license for write endpoints (organization build).
        // Sync the license before attempting to build the organization schema.
        if (financeTenantId && internalUrl) {
          const planSlug = input.planSlug ?? "starter";
          const planLimits = await getPlanLimits(db, planSlug);
          const internalSecret = apiConfig.internalApiSecret?.trim();
          if (!internalSecret) {
            throw new Error("INTERNAL_API_SECRET is required to resolve finance tenant for license sync");
          }

          // LicenseGuard checks license based on Finance's `tenant.id` (resolved via organization-id header).
          // To avoid any control-plane vs finance-tenant mapping drift, resolve the finance tenant id
          // from the admin email used for the build session, then sync against that tenant id.
          const resolveUrl = `${internalUrl.replace(/\/+$/, "")}/api/internal/resolve-tenant?email=${encodeURIComponent(
            input.adminEmail,
          )}`;
          const resolveRes = await fetch(resolveUrl, {
            method: "GET",
            headers: {
              "x-internal-secret": internalSecret,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!resolveRes.ok) {
            const detail = await resolveRes.text();
            throw new Error(
              `finance_resolve_tenant_http_${resolveRes.status}: ${detail.slice(0, 200)}`,
            );
          }
          const resolveJson: unknown = await resolveRes.json();
          const resolvedTenantId =
            resolveJson && typeof resolveJson === "object"
              ? Number(
                (resolveJson as Record<string, unknown>).tenantId ??
                (resolveJson as Record<string, unknown>).tenant_id,
              )
              : NaN;
          if (!resolvedTenantId || !Number.isFinite(resolvedTenantId) || resolvedTenantId <= 0) {
            throw new Error(`finance_resolve_tenant_invalid_response: ${JSON.stringify(resolveJson)}`);
          }

          await trace.event("progress", "Syncing finance license before organization build", {
            meta: {
              operationKey: "tenant.sync_finance_license_before_build",
              financeTenantId,
              resolvedTenantId,
              planSlug,
              maxOrganizations: planLimits.maxOrganizations,
              maxActivations: planLimits.maxActivations,
              maxUsers: planLimits.maxUsers,
            },
          });
          await syncFinanceLicense(
            internalUrl,
            {
              tenantId: resolvedTenantId,
              planSlug,
              status: "active",
              isPerpetual: true,
              maxOrganizations: planLimits.maxOrganizations,
              maxActivations: planLimits.maxActivations,
              maxUsers: planLimits.maxUsers,
            },
            log,
          );
          await trace.event("progress", "Finance license synced before organization build", {
            meta: {
              operationKey: "tenant.sync_finance_license_before_build",
              financeTenantId,
              resolvedTenantId,
            },
          });
        }

        const buildResult = await finance.buildOrganization(
          {
            internalBaseUrl: internalUrl,
            adminEmail: input.adminEmail,
            adminPassword: secrets.bootstrapAdminPassword(bootstrapPasswordKey),
            settings: inheritedSettings,
            correlationId,
            preferRetryAfterBootstrap: true,
            expectedOrganizationId: bootstrapFinanceOrganizationId,
          },
          log,
        );
        if (!buildResult.ok) {
          throw new Error(buildResult.error ?? "Organization build failed");
        }
        if (buildResult.financeOrganizationId) {
          financeOrganizationId = buildResult.financeOrganizationId;
        }
        if (input.controlPlaneOrgId && buildResult.financeOrganizationId) {
          const apiBase = apiConfig.controlPlaneApiBaseUrl;
          const saveUrl = `${apiBase}/internal/organizations/${input.controlPlaneOrgId}`;
          const secret = apiConfig.workerSecret;
          try {
            const saveRes = await fetch(saveUrl, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
              },
              body: JSON.stringify({
                financeOrganizationId: buildResult.financeOrganizationId,
              }),
              signal: AbortSignal.timeout(10_000),
            });
            if (!saveRes.ok) {
              log(
                `[provision] Warning: failed to save financeOrganizationId: ${saveRes.status}`,
              );
            } else {
              log("[provision] Saved financeOrganizationId mapping");
            }
          } catch (err) {
            log(
              `[provision] Warning: failed to save financeOrganizationId: ${err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
        if (input.adminEmail && internalUrl && buildResult.financeOrganizationId) {
          const internalSecret = apiConfig.internalApiSecret;
          if (internalSecret) {
            try {
              const attachUrl = `${internalUrl.replace(/\/+$/, "")}/api/internal/attach-user-to-tenant`;
              const attachRes = await fetch(attachUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": internalSecret,
                },
                body: JSON.stringify({
                  email: input.adminEmail,
                  organization_id: buildResult.financeOrganizationId,
                }),
                signal: AbortSignal.timeout(10_000),
              });
              if (!attachRes.ok) {
                log(`[provision] Warning: attach-user failed ${attachRes.status}`);
              } else {
                log("[provision] Admin user attached to org");
              }
            } catch (err) {
              log(
                `[provision] Warning: attach-user error: ${err instanceof Error ? err.message : String(err)
                }`,
              );
            }
          } else {
            log("[provision] Warning: INTERNAL_API_SECRET not configured; skipping attach-user");
          }
        }
        await markOp("tenant.build_organization", "Organization build completed", {
          alreadyBuilt: buildResult.alreadyBuilt === true,
          elapsedMs: elapsedMs(),
          ...(buildResult.financeOrganizationId
            ? { financeOrganizationId: buildResult.financeOrganizationId }
            : {}),
        });
        await trace.event(
          "progress",
          buildResult.alreadyBuilt
            ? "Organization was already built (skipped)"
            : "Organization built and seeded successfully",
          {
            meta: { operationKey: "tenant.build_organization", elapsedMs: elapsedMs() },
          },
        );
        log("[provision] step done: tenant.build_organization");
        if (
          financeTenantId
          && internalUrl
          && !hasOp("tenant.complete_setup_wizard")
        ) {
          const setupResult = await completeFinanceSetupWizard({
            internalBaseUrl: internalUrl,
            financeTenantId,
            log,
          });
          if (setupResult.ok) {
            await markOp("tenant.complete_setup_wizard", "Setup wizard marked complete", {
              financeTenantId,
            });
          } else {
            log(`[provision] setup wizard complete skipped: ${setupResult.error}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const detail =
          err && typeof err === "object" && "detail" in err
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any).detail
            : undefined;
        const richError = detail ? `${msg} :: ${detail}` : msg;
        await trace.event(
          "progress",
          `Organization build failed: ${richError}`,
          {
            level: "error",
            meta: {
              operationKey: "tenant.build_organization",
              error: richError,
              ...(detail ? { detail } : {}),
            },
          },
        );
        throw err;
      }
    } else {
      await trace.event("resume", "Skipping organization build (already journaled)", {
        meta: { operationKey: "tenant.build_organization" },
      });
    }

    if (
      isSeparateStackSubOrg({
        parentTenantSlug: input.parentTenantSlug,
        mainTenantInternalBaseUrl: input.mainTenantInternalBaseUrl,
        childInternalUrl: internalUrl,
      })
      && financeTenantId
      && apiConfig.internalApiSecret
      && input.mainTenantInternalBaseUrl?.trim()
      && internalUrl
    ) {
      try {
        log("[provision] Cross-stack COA copy from parent Finance stack");
        await copyCoaAcrossStacks({
          parentInternalUrl: input.mainTenantInternalBaseUrl.trim(),
          childInternalUrl: internalUrl,
          parentTenantId: 0,
          childTenantId: financeTenantId,
          internalSecret: apiConfig.internalApiSecret,
          adminEmail: input.adminEmail,
          correlationId,
          log,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`[provision] Cross-stack COA copy failed (non-fatal): ${msg}`);
        await trace.event("tenant.copy_coa", "Cross-stack chart of accounts copy failed", {
          level: "warn",
          meta: { error: msg },
        });
      }
    }

    await checkNotCancelled();
    if (!hasOp("tenant.activate_warehouses")) {
      const internalApiSecret = apiConfig.internalApiSecret;
      if (financeTenantId && internalUrl && internalApiSecret) {
        log("[provision] step start: tenant.activate_warehouses");
        await trace.event("progress", "Activating Finance primary warehouse", {
          meta: {
            operationKey: "tenant.activate_warehouses",
            financeTenantId,
            elapsedMs: elapsedMs(),
          },
        });
        try {
          const warehouseResult = await activateFinanceWarehouses({
            internalBaseUrl: internalUrl,
            internalApiSecret,
            financeTenantId,
            correlationId,
            log,
          });
          financeDefaultWarehouseId = warehouseResult.primaryWarehouseId;
          await markOp("tenant.activate_warehouses", "Finance warehouses activated", {
            financeTenantId,
            primaryWarehouseId: warehouseResult.primaryWarehouseId,
            alreadyActivated: warehouseResult.alreadyActivated,
            elapsedMs: elapsedMs(),
          });
          await trace.event("warehouses.activated", "Primary warehouse ready for POS sync", {
            meta: {
              financeTenantId,
              primaryWarehouseId: warehouseResult.primaryWarehouseId,
              alreadyActivated: warehouseResult.alreadyActivated,
            },
          });
          log("[provision] step done: tenant.activate_warehouses");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await trace.event("warehouses.activated", `Warehouse activation failed: ${msg}`, {
            level: "error",
            meta: { financeTenantId, error: msg },
          });
          throw err;
        }
      } else {
        log(
          "[provision] Skipping warehouse activation (missing financeTenantId, internal URL, or INTERNAL_API_SECRET)",
        );
        await markOp("tenant.activate_warehouses", "Skipped warehouse activation", {
          skipped: true,
          hasFinanceTenantId: Boolean(financeTenantId),
        });
      }
    } else {
      await trace.event("resume", "Skipping warehouse activation (already journaled)", {
        meta: { operationKey: "tenant.activate_warehouses" },
      });
    }

    await checkNotCancelled();
    if (!hasOp("tenant.seed_pos_defaults")) {
      const internalApiSecret = apiConfig.internalApiSecret;
      const seedPosDefaults =
        hasAccountingAndPos(licensedModules)
        && financeTenantId
        && internalUrl
        && internalApiSecret;
      if (seedPosDefaults) {
        log("[provision] step start: tenant.seed_pos_defaults");
        await trace.event("progress", "Seeding Finance POS defaults (walk-in customer, deposit accounts)", {
          meta: {
            operationKey: "tenant.seed_pos_defaults",
            financeTenantId,
            elapsedMs: elapsedMs(),
          },
        });
        try {
          const seeded = await seedFinancePosDefaults({
            internalBaseUrl: internalUrl,
            internalApiSecret,
            financeTenantId: financeTenantId!,
            correlationId,
            log,
          });
          walkInCustomerId = seeded.walkInCustomerId;
          cashAccountId = seeded.cashAccountId;
          cardAccountId = seeded.cardAccountId;
          serviceChargeItemId = seeded.serviceChargeItemId;
          discountItemId = seeded.discountItemId;
          defaultVendorId = seeded.defaultVendorId;
          inventoryAccountId = seeded.inventoryAccountId;
          inventoryVarianceAccountId = seeded.inventoryVarianceAccountId;
          await persistFinanceDeploymentIds(db, deploymentId, {
            financeTenantId,
            financeDefaultWarehouseId,
            walkInCustomerId,
            cashAccountId,
            cardAccountId,
          });
          await markOp("tenant.seed_pos_defaults", "Finance POS defaults seeded", {
            financeTenantId,
            walkInCustomerId,
            cashAccountId,
            cardAccountId,
            serviceChargeItemId,
            discountItemId,
            elapsedMs: elapsedMs(),
          });
          await trace.event("pos_defaults_seeded", "Walk-in customer and deposit accounts ready", {
            meta: {
              walkInCustomerId,
              cashAccountId,
              cardAccountId,
              serviceChargeItemId,
              discountItemId,
            },
          });
          log("[provision] step done: tenant.seed_pos_defaults");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await trace.event("pos_defaults_seeded", `POS defaults seed failed: ${msg}`, {
            level: "error",
            meta: { financeTenantId, error: msg },
          });
          throw err;
        }
      } else {
        log(
          `[provision] Skipping POS defaults seed (modules=${licensedModules.join(",")}, financeTenantId=${financeTenantId ?? "n/a"})`,
        );
        await markOp("tenant.seed_pos_defaults", "Skipped POS defaults seed", {
          skipped: true,
          modules: licensedModules,
        });
      }
    } else {
      await trace.event("resume", "Skipping POS defaults seed (already journaled)", {
        meta: { operationKey: "tenant.seed_pos_defaults" },
      });
    }

    await checkNotCancelled();
    let forceWireRerun: boolean = wireOnlyRetry;
    if (tenantId) {
      const [partialRow] = await db
        .select({
          tenantStatus: tenants.status,
          partialFailureKind: tenantDeployments.partialFailureKind,
        })
        .from(tenants)
        .innerJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (
        partialRow?.tenantStatus === "partial"
        && partialRow.partialFailureKind === "wire_failed"
      ) {
        forceWireRerun = true;
      }
    }

    const posOutcome = await runPosProvisionStep({
      licensedModules,
      slug: input.slug,
      tenantId,
      tenantName: input.name,
      adminEmail: input.adminEmail,
      planSlug: input.planSlug,
      financeInternalPort: port,
      db,
      log,
      trace,
      hasOp,
      markOp,
      posOrganizationId,
      posUrl,
      posApiUrl,
    });
    let integrationWired = false;
    if (posOutcome.posStatus === "ok") {
      posOrganizationId = posOutcome.posOrganizationId;
      posUrl = posOutcome.posUrl;
      posApiUrl = posOutcome.posApiUrl;
      posDefaultCredentials = posOutcome.posDefaultCredentials;

      if (
        posOrganizationId
        && posOutcome.posHostPort
        && financeTenantId
        && walkInCustomerId
        && cashAccountId
        && cardAccountId
        && port
      ) {
        const wireResult = await runWirePosIntegrationStep({
          licensedModules,
          slug: input.slug,
          posOrganizationId,
          posHostPort: posOutcome.posHostPort,
          financeInternalPort: port,
          workerInternalUrl: internalUrl,
          financeTenantId,
          walkInCustomerId,
          cashAccountId,
          cardAccountId,
          serviceChargeItemId,
          discountItemId,
          financeDefaultWarehouseId,
          defaultVendorId,
          inventoryAccountId,
          inventoryVarianceAccountId,
          log,
          trace,
          markOp,
          hasOp,
          forceRerun: forceWireRerun,
        });
        if (!wireResult.ok) {
          const wireError = wireResult.error;
          if (hasAccountingAndPos(licensedModules) && tenantId) {
            await markTenantPartial(db, {
              tenantId,
              kind: "wire_failed",
              lastError: wireError,
            });
            log(
              `[provision] Finance+POS active but integration wire failed — tenant partial slug=${input.slug}`,
            );
            return {
              ok: true,
              tenantId: tenantId!,
              deploymentId: deploymentId!,
              composeProjectName: project,
              internalPort: port,
              baseUrl,
              oneTimeAdminPassword: oneTimeAdminPassword!,
              financeOrganizationId,
              financeTenantId,
              financeDefaultWarehouseId,
              walkInCustomerId,
              cashAccountId,
              cardAccountId,
              posOrganizationId,
              posUrl,
              posApiUrl,
              posDefaultCredentials,
              posStatus: "ok",
              posError: wireError,
              tenantStatus: "partial",
            };
          }
        } else {
          integrationWired = true;
        }
      }
    }
    if (posOutcome.posStatus === "failed" && tenantId) {
      const posError = posOutcome.posError ?? "POS provisioning failed";
      if (hasAccountingAndPos(licensedModules)) {
        await markTenantPartial(db, {
          tenantId,
          kind: "pos_failed",
          lastError: posError,
        });
        log(`[provision] Finance active, POS failed — tenant marked partial slug=${input.slug}`);
        return {
          ok: true,
          tenantId: tenantId!,
          deploymentId: deploymentId!,
          composeProjectName: project,
          internalPort: port,
          baseUrl,
          oneTimeAdminPassword: oneTimeAdminPassword!,
          financeOrganizationId,
          financeTenantId,
          financeDefaultWarehouseId,
          walkInCustomerId,
          cashAccountId,
          cardAccountId,
          posStatus: "failed",
          posError,
          tenantStatus: "partial",
        };
      }
      if (isPosOnlyModules(licensedModules)) {
        await rollbackProvision(db, tenantId, correlationId, posError, {
          deps,
          composeCtx: sideEffectsStarted ? composeCtx : null,
          log,
        });
        throw new Error(posError);
      }
    }
    if (licensedModules.includes("pms") && tenantId) {
      try {
        await provisionPmsStack({ slug: input.slug, tenantId, log });
      } catch (pmsErr) {
        log(
          `[provision][pms] non-fatal: ${pmsErr instanceof Error ? pmsErr.message : String(pmsErr)}`,
        );
      }
    }
    if (licensedModules.includes("chat") && tenantId) {
      await provisionChatwootAccount({
        db,
        tenantId,
        tenantName: input.name,
        adminEmail: input.adminEmail,
        chatwootBaseUrl: process.env.CHATWOOT_BASE_URL ?? "",
        chatwootApiKey: process.env.CHATWOOT_API_ACCESS_TOKEN ?? "",
        log,
      });
    }

    if (tenantId) {
      await db.update(tenants).set({ status: "active" }).where(eq(tenants.id, tenantId));
      await db
        .update(tenantDeployments)
        .set({ status: "active", lastError: null, updatedAt: new Date() })
        .where(eq(tenantDeployments.tenantId, tenantId));
    }

    log(`[provision] success slug=${input.slug} tenantId=${tenantId}`);
    return {
      ok: true,
      tenantId: tenantId!,
      deploymentId: deploymentId!,
      composeProjectName: project,
      internalPort: port,
      baseUrl,
      oneTimeAdminPassword: oneTimeAdminPassword!,
      financeOrganizationId,
      financeTenantId,
      financeDefaultWarehouseId,
      walkInCustomerId,
      cashAccountId,
      cardAccountId,
      posOrganizationId,
      posUrl,
      posApiUrl,
      posDefaultCredentials,
      posStatus: posOutcome.posStatus,
      tenantStatus: "active",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (tenantId && !input.skipTenantCreation) {
      await rollbackProvision(db, tenantId, correlationId, message, {
        deps,
        composeCtx: sideEffectsStarted ? composeCtx : null,
        log,
      });
    }
    await trace
      .event("failed", message, { level: "error", meta: { cause: String(err) } })
      .catch((error) => recordCleanupError("final_failed_event", error));
    log(`[provision] failed slug=${input.slug} correlationId=${correlationId}: ${message}`);
    throw err instanceof Error ? err : new Error(message);
  }
}

export type AddModuleInput = {
  tenantId: string;
  slug: string;
  name: string;
  adminEmail: string;
  module: "pos" | "pms" | "chat" | "accounting";
  planSlug?: string;
};

export type AddModuleResult = {
  ok: true;
  module: AddModuleInput["module"];
  posStatus?: string;
  posError?: string;
  posOrganizationId?: string;
  posUrl?: string;
  posApiUrl?: string;
  posDefaultCredentials?: import("../domain/provisioning/types.js").PosDefaultCredentials;
  tenantStatus?: string;
};

export async function runAddModuleStep(
  db: PostgresJsDatabase<typeof dbSchema>,
  input: AddModuleInput,
  log: (m: string) => void,
  correlationId: string,
): Promise<AddModuleResult> {
  try {
    const trace = createProvisionTracer(
      db,
      correlationId,
      () => ({ slug: input.slug, tenantId: input.tenantId }),
      log,
    );
    const journalState = await loadProvisionJournalState(db, correlationId);
    const completedOps = journalState.completedOps;
    const hasOp = (key: string) => completedOps.has(key);
    const markOp = async (operationKey: string, message: string, meta?: Record<string, unknown>) => {
      completedOps.add(operationKey);
      await trace.event("journal", message, {
        meta: { operationKey, ...meta },
      });
    };

    const [row] = await db
      .select({
        tenantId: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        ownerId: tenants.ownerId,
        adminEmail: tenants.adminEmail,
        adminFirstName: tenants.adminFirstName,
        adminLastName: tenants.adminLastName,
        modules: tenants.modules,
        deploymentId: tenantDeployments.id,
        internalPort: tenantDeployments.internalPort,
        financeTenantId: tenantDeployments.financeTenantId,
        financeDefaultWarehouseId: tenantDeployments.financeDefaultWarehouseId,
        financeWalkInCustomerId: tenantDeployments.financeWalkInCustomerId,
        financeCashAccountId: tenantDeployments.financeCashAccountId,
        financeCardAccountId: tenantDeployments.financeCardAccountId,
        posOrganizationId: tenantDeployments.posOrganizationId,
      })
      .from(tenants)
      .innerJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
      .where(eq(tenants.id, input.tenantId))
      .limit(1);

    if (!row) {
      throw new Error(`tenant_not_found:${input.tenantId}`);
    }

    const licensedModules = resolveTenantModules(parseTenantModulesJson(row.modules));
    if (!licensedModules.includes(input.module)) {
      throw new Error(`module_not_on_tenant:${input.module}`);
    }

    await trace.event("add_module", `Provisioning module ${input.module}`, {
      meta: { module: input.module, existingModules: licensedModules },
    });

    const internalApiSecret = apiConfig.internalApiSecret?.trim() ?? "";
    const financeInternalPort = row.internalPort ?? undefined;
    const internalUrl =
      financeInternalPort && financeInternalPort > 0
        ? `http://${process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? apiConfig.tenantInternalHost ?? "127.0.0.1"}:${financeInternalPort}`
        : undefined;
    const rootDomain = apiConfig.rootDomain || "example.com";
    const publicScheme = apiConfig.publicBaseUrlScheme;
    const financeUrl = `${publicScheme}://${input.slug}.${rootDomain}`;

    let result: AddModuleResult | undefined;

    if (input.module === "accounting") {
      if (!row.financeTenantId || row.financeTenantId <= 0) {
        if (!hasOp("add_module.accounting_stack")) {
          const provisionResult = await provisionTenant(
            db,
            {
              slug: input.slug,
              name: row.name,
              ownerId: row.ownerId,
              adminEmail: row.adminEmail,
              adminFirstName: row.adminFirstName,
              adminLastName: row.adminLastName,
              planSlug: input.planSlug,
              modules: licensedModules,
              skipTenantCreation: true,
              existingTenantId: input.tenantId,
            },
            log,
            correlationId,
          );
          if (!provisionResult.ok) {
            throw new Error(provisionResult.message);
          }
          await markOp("add_module.accounting_stack", "Finance stack provisioned for module add");
        }
      } else {
        const { executeAddAccountingModuleRuntime } = await import(
          "./add-accounting-module-runtime.js"
        );
        result = await executeAddAccountingModuleRuntime(db, input, log, correlationId);
      }

      if (!hasOp("add_module.finance_welcome_email")) {
        try {
          const bootstrapPassword = oneTimeAdminPasswordFromSlug(input.slug);
          await sendFinanceWelcomeEmail({
            to: input.adminEmail,
            tenantName: input.name,
            financeUrl,
            adminEmail: input.adminEmail,
            oneTimePassword: bootstrapPassword,
            modules: licensedModules,
            tenantId: input.tenantId,
          });
          await markOp("add_module.finance_welcome_email", "Finance welcome email sent");
        } catch (emailErr) {
          log(
            `[add_module][accounting] welcome email failed (non-fatal): ${emailErr instanceof Error ? emailErr.message : String(emailErr)
            }`,
          );
        }
      }

      result = result ?? { ok: true, module: "accounting", tenantStatus: "active" };
    } else if (input.module === "pos") {
      let financeTenantId = row.financeTenantId ?? undefined;
      let financeDefaultWarehouseId = row.financeDefaultWarehouseId ?? undefined;
      let walkInCustomerId = row.financeWalkInCustomerId ?? undefined;
      let cashAccountId = row.financeCashAccountId ?? undefined;
      let cardAccountId = row.financeCardAccountId ?? undefined;
      let serviceChargeItemId: number | undefined;
      let discountItemId: number | undefined;
      let defaultVendorId: number | undefined;
      let inventoryAccountId: number | undefined;
      let inventoryVarianceAccountId: number | undefined;

      const hasAccounting = licensedModules.includes("accounting");
      if (hasAccounting && financeTenantId && internalUrl && internalApiSecret) {
        if (
          (!financeDefaultWarehouseId || financeDefaultWarehouseId <= 0)
          && !hasOp("tenant.activate_warehouses")
        ) {
          const wh = await activateFinanceWarehouses({
            internalBaseUrl: internalUrl,
            internalApiSecret,
            financeTenantId,
            correlationId,
            log,
          });
          financeDefaultWarehouseId = wh.primaryWarehouseId;
          await persistFinanceDeploymentIds(db, row.deploymentId, {
            financeDefaultWarehouseId,
          });
          await markOp("tenant.activate_warehouses", "Finance warehouses activated for POS add");
        }
        const needsDepositIds =
          (!walkInCustomerId || walkInCustomerId <= 0)
          || (!cashAccountId || cashAccountId <= 0)
          || (!cardAccountId || cardAccountId <= 0);
        if ((needsDepositIds || !serviceChargeItemId || !discountItemId) && !hasOp("tenant.seed_pos_defaults")) {
          const seeded = await seedFinancePosDefaults({
            internalBaseUrl: internalUrl,
            internalApiSecret,
            financeTenantId,
            correlationId,
            log,
          });
          if (needsDepositIds) {
            walkInCustomerId = seeded.walkInCustomerId;
            cashAccountId = seeded.cashAccountId;
            cardAccountId = seeded.cardAccountId;
            await persistFinanceDeploymentIds(db, row.deploymentId, {
              walkInCustomerId,
              cashAccountId,
              cardAccountId,
            });
          }
          serviceChargeItemId = seeded.serviceChargeItemId;
          discountItemId = seeded.discountItemId;
          defaultVendorId = seeded.defaultVendorId;
          inventoryAccountId = seeded.inventoryAccountId;
          inventoryVarianceAccountId = seeded.inventoryVarianceAccountId;
          await markOp("tenant.seed_pos_defaults", "Finance POS defaults seeded for module add");
        }
      }

      const posOutcome = await runPosProvisionStep({
        licensedModules,
        slug: input.slug,
        tenantId: input.tenantId,
        tenantName: input.name,
        adminEmail: input.adminEmail,
        planSlug: input.planSlug,
        financeInternalPort: financeInternalPort ?? undefined,
        db,
        log,
        trace,
        hasOp,
        markOp,
        posOrganizationId: row.posOrganizationId ?? undefined,
      });

      if (posOutcome.posStatus !== "ok") {
        throw new Error(posOutcome.posError ?? "POS module provisioning failed");
      }

      if (posOutcome.posOrganizationId) {
        await db
          .update(tenantDeployments)
          .set({
            posOrganizationId: posOutcome.posOrganizationId,
            ...(posOutcome.posUrl ? { posUrl: posOutcome.posUrl } : {}),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(tenantDeployments.tenantId, input.tenantId));
      }

      if (
        hasAccountingAndPos(licensedModules)
        && posOutcome.posOrganizationId
        && posOutcome.posHostPort
        && financeTenantId
        && walkInCustomerId
        && cashAccountId
        && cardAccountId
        && financeInternalPort
      ) {
        const wireResult = await runWirePosIntegrationStep({
          licensedModules,
          slug: input.slug,
          posOrganizationId: posOutcome.posOrganizationId,
          posHostPort: posOutcome.posHostPort,
          financeInternalPort,
          workerInternalUrl: internalUrl,
          financeTenantId,
          walkInCustomerId,
          cashAccountId,
          cardAccountId,
          serviceChargeItemId,
          discountItemId,
          financeDefaultWarehouseId,
          defaultVendorId,
          inventoryAccountId,
          inventoryVarianceAccountId,
          log,
          trace,
          markOp,
          hasOp,
        });
        if (!wireResult.ok) {
          throw new Error(wireResult.error);
        }
      }

      if (financeTenantId && internalUrl) {
        const planSlug = input.planSlug ?? "starter";
        const planLimits = await getPlanLimits(db, planSlug);
        await syncFinanceLicense(
          internalUrl,
          {
            tenantId: financeTenantId,
            planSlug,
            status: "active",
            isPerpetual: true,
            maxOrganizations: planLimits.maxOrganizations,
            maxActivations: planLimits.maxActivations,
            maxUsers: planLimits.maxUsers,
          },
          log,
        );
      }

      result = {
        ok: true,
        module: "pos",
        posStatus: "ok",
        tenantStatus: "active",
        posOrganizationId: posOutcome.posOrganizationId,
        posUrl: posOutcome.posUrl,
        posApiUrl: posOutcome.posApiUrl,
        posDefaultCredentials: posOutcome.posDefaultCredentials,
      };
    } else if (input.module === "pms") {
      await provisionPmsStack({ slug: input.slug, tenantId: input.tenantId, log });
      result = { ok: true, module: "pms", tenantStatus: "active" };
    } else {
      const chatwootBaseUrl = process.env.CHATWOOT_BASE_URL ?? "";
      const chatwootApiKey = process.env.CHATWOOT_API_ACCESS_TOKEN ?? "";
      await provisionChatwootAccount({
        db,
        tenantId: input.tenantId,
        tenantName: input.name,
        adminEmail: input.adminEmail,
        chatwootBaseUrl,
        chatwootApiKey,
        log,
      });
      result = { ok: true, module: "chat", tenantStatus: "active" };
    }

    if (!result) {
      throw new Error(`add_module_no_result:${input.module}`);
    }

    await db
      .update(tenants)
      .set({ status: "active" })
      .where(eq(tenants.id, input.tenantId));
    await db
      .update(tenantDeployments)
      .set({ status: "active", lastError: null, updatedAt: new Date() })
      .where(eq(tenantDeployments.tenantId, input.tenantId));

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await revertAddModuleFailure(db, input.tenantId, correlationId, message, log);
    throw err instanceof Error ? err : new Error(message);
  }
}

/** @deprecated Use runAddModuleStep */
export const executeAddModuleRuntime = runAddModuleStep;

function resolveOneTimeAdminPassword(
  secrets: TenantProvisionServiceDeps["secrets"],
  tenantKey: string,
): string {
  return secrets.bootstrapAdminPassword(tenantKey);
}

function oneTimeAdminPasswordFromSlug(slug: string): string {
  return new CryptoTenantSecretGenerator().bootstrapAdminPassword(slug.trim());
}

function parseTenantModulesJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((m): m is string => typeof m === "string") : [];
  } catch {
    return [];
  }
}
