// Extracted POS functions
import { eq } from "drizzle-orm";
import { tenantDeployments } from "@repo/db/schema";
import { getLicenseExpiry, getPlanLimits } from "../provision-runtime.js";
import { provisionPosStackTracked } from "../module-stacks.js";
import { getTenantStackPaths, readTenantEnvFile } from "../../domain/provisioning/tenant-env.js";
import { resolvePosTenantEnvPath } from "../module-stacks.js";
import { join } from "node:path";
import { runDockerExec } from "../../domain/provisioning/adapters/execa-docker-compose-runner.js";
import { sendPosWelcomeEmail } from "../../domain/provisioning/adapters/send-pos-welcome.js";
import { apiConfig } from "@repo/config";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import { createProvisionTracer } from "../../domain/provision-trace.js";
import type { PosProvisionOutcome } from "../provision-runtime.js";

export async function runPosProvisionStep(params: {
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

export async function runWirePosIntegrationStep(params: {
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

export async function resolvePosBackendHostPort(slug: string): Promise<number | null> {
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

