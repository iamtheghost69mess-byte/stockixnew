import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createCipheriv, randomBytes } from "node:crypto";
import { execa } from "execa";

import { apiConfig, posConfig } from "@repo/config";
import { allocateOrganizationNumber, allocateTenantPort } from "@repo/db";
import { tenantDeployments, tenantProvisionEvents, tenants } from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { asc, eq } from "drizzle-orm";
import * as dbSchema from "@repo/db/schema";

import { defaultTenantEnvRoot } from "../domain/env-paths.js";
import { getTenantStackPaths } from "../domain/provision-paths.js";
import { createProvisionTracer } from "../domain/provision-trace.js";
import { composeProjectName, tenantMysqlVolumeName } from "../domain/provisioning/compose-project-name.js";
import {
  COMPOSE_DOWN_TIMEOUT_MS,
  resolveComposeStepTimeoutMs,
  STOCKIX_FINANCE_HEALTH_TIMEOUT_MS,
} from "../domain/provisioning/constants.js";
import { MENA_DEFAULTS, type OrgBuildSettings } from "../domain/provisioning/adapters/fetch-stockix-finance-org-settings.js";
import type { TenantProvisionServiceDeps } from "../domain/provisioning/tenant-provision-service.js";
import {
  buildTenantEnvMap,
  writeTenantEnvFileAtomic,
} from "../domain/provisioning/tenant-env.js";
import { activateFinanceWarehouses } from "../domain/provisioning/adapters/activate-finance-warehouses.js";
import { seedFinancePosDefaults } from "../domain/provisioning/adapters/seed-finance-pos-defaults.js";
import { wirePosBigcapitalIntegration } from "../domain/provisioning/adapters/wire-pos-bigcapital-integration.js";
import { syncFinanceLicense } from "../domain/provisioning/adapters/sync-finance-license.js";
import { composeDownBestEffort } from "../domain/provisioning/tenant-docker-workflow.js";
import type { ProvisionInput, ProvisionResult } from "../domain/provisioning/types.js";
import { provisionChatwootAccount } from "./chatwoot-provision.js";
import {
  hasAccountingAndPos,
  isModuleGatingEnabled,
  isPosOnlyModules,
  shouldProvisionFinanceStack,
  provisionPmsStack,
  provisionPosStackTracked,
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
  if (modules.includes("accounting") && !apiConfig.internalApiSecret?.trim()) {
    throw new Error(
      "INTERNAL_API_SECRET is required when provisioning the accounting module",
    );
  }
}

async function runPosProvisionStep(params: {
  licensedModules: string[];
  slug: string;
  tenantId: string | undefined;
  tenantName: string;
  adminEmail: string;
  financeInternalPort?: number;
  db: PostgresJsDatabase<typeof dbSchema>;
  log: (m: string) => void;
  trace: ReturnType<typeof createProvisionTracer>;
}): Promise<PosProvisionOutcome> {
  if (!params.licensedModules.includes("pos") || !params.tenantId) {
    return { posStatus: "skipped" };
  }
  try {
    const posResult = await provisionPosStackTracked(
      {
        slug: params.slug,
        tenantId: params.tenantId,
        tenantName: params.tenantName,
        adminEmail: params.adminEmail,
        db: params.db,
        log: params.log,
        financeInternalPort: params.financeInternalPort,
      },
      params.trace,
    );
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
  financeDefaultWarehouseId?: number;
  log: (m: string) => void;
  trace: ReturnType<typeof createProvisionTracer>;
  markOp: (
    operationKey: string,
    message: string,
    meta?: Record<string, unknown>,
  ) => Promise<void>;
  hasOp: (key: string) => boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasAccountingAndPos(params.licensedModules)) {
    return { ok: true };
  }
  if (params.hasOp("tenant.wire_pos_integration")) {
    await params.trace.event("resume", "Skipping POS integration wire (already journaled)", {
      meta: { operationKey: "tenant.wire_pos_integration" },
    });
    return { ok: true };
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
      defaultWarehouseId: params.financeDefaultWarehouseId,
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

function encryptDeploymentSecret(plaintext: string): string {
  const key = Buffer.from(apiConfig.deploymentSecretKey, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

import { loadProvisionJournalState } from "./provision-journal.js";

async function resolveServerInternalUrl(params: {
  composeFile: string;
  project: string;
  envPath: string;
  composeEnv: Record<string, string>;
  fallbackHost: string;
  fallbackPort: number;
}): Promise<string> {
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
      return `http://${params.fallbackHost}:${match[1]}`;
    }
  } catch {
    // Fallback keeps backward compatibility if port lookup is unavailable.
  }
  return `http://${params.fallbackHost}:${params.fallbackPort}`;
}

export async function executeProvisionRuntime(
  deps: TenantProvisionServiceDeps,
  db: PostgresJsDatabase<typeof dbSchema>,
  input: ProvisionInput,
  log: (m: string) => void,
  correlationId: string,
  assertNotCancelled?: () => Promise<void>,
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
  const mysqlVolumeName = tenantMysqlVolumeName(input.slug);
  const baseUrl = `${publicScheme}://${input.slug}.${rootDomain}`;
  const requestId = correlationId;
  let port: number | undefined;
  let oneTimeAdminPassword: string | undefined;
  let financeOrganizationId: string | undefined;
  let financeTenantId: number | undefined;
  let financeDefaultWarehouseId: number | undefined;
  let walkInCustomerId: number | undefined;
  let cashAccountId: number | undefined;
  let cardAccountId: number | undefined;
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
  const checkNotCancelled = async () => {
    if (!assertNotCancelled) return;
    await assertNotCancelled();
  };
  const runComposeWithCancellation = async (
    args: string[],
  ): Promise<void> => {
    log(`[compose] starting: docker compose ${args.join(" ")}`);
    const controller = new AbortController();
    const intervalId = setInterval(() => {
      checkNotCancelled().catch((error) => {
        if (!controller.signal.aborted) {
          log(
            `[compose] cancellation requested during ${args.join(" ")}: ${
              error instanceof Error ? error.message : String(error)
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
            void trace.event("compose", line.slice(0, 240), { level: "info" });
          },
        },
      );
      log(`[compose] completed: docker compose ${args.join(" ")}`);
      await checkNotCancelled();
    } catch (error) {
      log(
        `[compose] failed: docker compose ${args.join(" ")} :: ${
          error instanceof Error ? error.message : String(error)
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
    oneTimeAdminPassword = secrets.bootstrapAdminPassword(bootstrapPasswordKey);
    const jwtSecret = secrets.persistSecret(secrets.randomHex(32));
    const dbPassword = secrets.persistSecret(secrets.randomHex(16));
    const dbRootPassword = secrets.persistSecret(secrets.randomHex(16));
    const mongoUrlPersisted = "mongodb://mongo/stockix";
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

    if (posOnlyRetry) {
      const [existing] = await db
        .select({
          tenantId: tenants.id,
          deploymentId: tenantDeployments.id,
          internalPort: tenantDeployments.internalPort,
          composeProjectName: tenantDeployments.composeProjectName,
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
      await checkNotCancelled();
      const posOutcome = await runPosProvisionStep({
        licensedModules: licensedModulesEarly,
        slug: input.slug,
        tenantId,
        tenantName: input.name,
        adminEmail: input.adminEmail,
        financeInternalPort: port,
        db,
        log,
        trace,
      });
      if (posOutcome.posStatus === "ok") {
        await db.update(tenants).set({ status: "active" }).where(eq(tenants.id, tenantId));
        await db
          .update(tenantDeployments)
          .set({ status: "active", lastError: null, updatedAt: new Date() })
          .where(eq(tenantDeployments.tenantId, tenantId));
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
          tenantStatus: "active",
          posOrganizationId: posOutcome.posOrganizationId,
          posUrl: posOutcome.posUrl,
          posApiUrl: posOutcome.posApiUrl,
          posDefaultCredentials: posOutcome.posDefaultCredentials,
        };
      }
      const posError = posOutcome.posError ?? "POS provisioning failed";
      await db.update(tenants).set({ status: "partial" }).where(eq(tenants.id, tenantId));
      await db
        .update(tenantDeployments)
        .set({ status: "active", lastError: posError, updatedAt: new Date() })
        .where(eq(tenantDeployments.tenantId, tenantId));
      return {
        ok: true,
        tenantId,
        deploymentId,
        composeProjectName: existing.composeProjectName,
        internalPort: port,
        baseUrl: `${publicScheme}://${input.slug}.${rootDomain}`,
        oneTimeAdminPassword: oneTimeAdminPassword!,
        posStatus: "failed",
        posError,
        tenantStatus: "partial",
        posOrganizationId: posOutcome.posOrganizationId,
        posUrl: posOutcome.posUrl,
        posApiUrl: posOutcome.posApiUrl,
      };
    }

    const existingSlug = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, input.slug))
      .limit(1);
    if (existingSlug.length > 0) {
      throw new Error(`tenant_slug_exists:${input.slug}`);
    }
    const organizationNumber = await allocateOrganizationNumber(db);

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
        mysqlPassword: encryptDeploymentSecret(dbPassword),
        mysqlRootPassword: encryptDeploymentSecret(dbRootPassword),
        jwtSecret: encryptDeploymentSecret(jwtSecret),
        mongoUrl: mongoUrlPersisted,
      }).returning({ id: tenantDeployments.id });
      deploymentId = dRow!.id;
    });
    if (port === undefined) {
      throw new Error("provision_internal: expected allocated port after transaction");
    }
    await checkNotCancelled();

    const licensedModules = resolveTenantModules(input.modules);
    const moduleGating = isModuleGatingEnabled();
    if (moduleGating && !shouldProvisionFinanceStack(licensedModules)) {
      log(`[provision] module gating: skipping Finance stack (modules=${licensedModules.join(",")})`);
      const posOutcome = await runPosProvisionStep({
        licensedModules,
        slug: input.slug,
        tenantId,
        tenantName: input.name,
        adminEmail: input.adminEmail,
        financeInternalPort: port,
        db,
        log,
        trace,
      });
      if (posOutcome.posStatus === "failed") {
        const posError = posOutcome.posError ?? "POS provisioning failed";
        if (tenantId) {
          await db.update(tenants).set({ status: "failed" }).where(eq(tenants.id, tenantId));
          await db
            .update(tenantDeployments)
            .set({ status: "failed", lastError: posError, updatedAt: new Date() })
            .where(eq(tenantDeployments.tenantId, tenantId));
        }
        return { ok: false, message: posError, cause: posError };
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

    const tenantEnvMap = buildTenantEnvMap({
      mysqlVolumeName,
      stockixFinanceRoot,
      baseUrl,
      jwtSecret,
      dbPassword,
      dbRootPassword,
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
      stockixTenantId: input.stockixTenantId,
      stockixApiUrl: input.stockixApiUrl,
      internalApiSecret: apiConfig.internalApiSecret,
    });
    const envPath = await writeTenantEnvFileAtomic(join(tenantEnvRoot, input.slug), tenantEnvMap);
    const composeEnv = {
      ...tenantEnvMap,
      COMPOSE_PROJECT_NAME: project,
    };
    composeCtx = { composeFile, project, envPath, composeEnv };
    const { docker, finance, edge } = deps;
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
        ["down", "--remove-orphans", "-v", "--timeout", "10"],
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
      await runComposeWithCancellation([
        "up",
        "-d",
        "--no-deps",
        "--remove-orphans",
        "mysql",
        "mongo",
        "redis",
      ]);
      await markOp("docker.data_step", "Data services compose step completed", {
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
      log("database_migration");
      await runComposeWithCancellation(["run", "--rm", "--build", "database_migration"]);
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
      await runComposeWithCancellation([
        "up",
        "-d",
        "--remove-orphans",
        "--force-recreate",
        "webapp",
        "nginx",
        "server",
      ]);
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

    const internalUrl = await resolveServerInternalUrl({
      composeFile,
      project,
      envPath: composeCtx.envPath,
      composeEnv: composeCtx.composeEnv,
      fallbackHost: apiConfig.tenantInternalHost,
      fallbackPort: port,
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
            `[provision] Settings fetch failed, using defaults: ${
              err instanceof Error ? err.message : String(err)
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
        const buildResult = await finance.buildOrganization(
          {
            internalBaseUrl: internalUrl,
            adminEmail: input.adminEmail,
            adminPassword: secrets.bootstrapAdminPassword(bootstrapPasswordKey),
            settings: inheritedSettings,
            correlationId,
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
          const apiBase = `http://localhost:${apiConfig.port}`;
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
              `[provision] Warning: failed to save financeOrganizationId: ${
                err instanceof Error ? err.message : String(err)
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
                `[provision] Warning: attach-user error: ${
                  err instanceof Error ? err.message : String(err)
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await trace.event(
          "progress",
          `Organization build failed: ${msg}`,
          {
            level: "error",
            meta: { operationKey: "tenant.build_organization", error: msg },
          },
        );
        throw err;
      }
    } else {
      await trace.event("resume", "Skipping organization build (already journaled)", {
        meta: { operationKey: "tenant.build_organization" },
      });
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
            elapsedMs: elapsedMs(),
          });
          await trace.event("pos_defaults_seeded", "Walk-in customer and deposit accounts ready", {
            meta: {
              walkInCustomerId,
              cashAccountId,
              cardAccountId,
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
    if (!hasOp("edge.publish")) {
      log("[provision] step start: edge.publish");
      try {
        await edge.publish(input.slug, port, rootDomain);
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
    if (financeTenantId && internalUrl) {
      await syncFinanceLicense(
        internalUrl,
        { tenantId: financeTenantId, status: "active", isPerpetual: true },
        log,
      );
    }

    const posOutcome = await runPosProvisionStep({
      licensedModules,
      slug: input.slug,
      tenantId,
      tenantName: input.name,
      adminEmail: input.adminEmail,
      financeInternalPort: port,
      db,
      log,
      trace,
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
          financeDefaultWarehouseId,
          log,
          trace,
          markOp,
          hasOp,
        });
        if (!wireResult.ok) {
          const wireError = wireResult.error;
          if (hasAccountingAndPos(licensedModules) && tenantId) {
            await db.update(tenants).set({ status: "partial" }).where(eq(tenants.id, tenantId));
            await db
              .update(tenantDeployments)
              .set({ status: "active", lastError: wireError, updatedAt: new Date() })
              .where(eq(tenantDeployments.tenantId, tenantId));
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
        await db.update(tenants).set({ status: "partial" }).where(eq(tenants.id, tenantId));
        await db
          .update(tenantDeployments)
          .set({ status: "active", lastError: posError, updatedAt: new Date() })
          .where(eq(tenantDeployments.tenantId, tenantId));
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
        await db.update(tenants).set({ status: "failed" }).where(eq(tenants.id, tenantId));
        await db
          .update(tenantDeployments)
          .set({ status: "failed", lastError: posError, updatedAt: new Date() })
          .where(eq(tenantDeployments.tenantId, tenantId));
        return { ok: false, message: posError, cause: posError };
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
    if (tenantId) {
      await db
        .update(tenants)
        .set({ status: "failed" })
        .where(eq(tenants.id, tenantId))
        .catch((error) => recordCleanupError("tenant_status_failed_update", error));
    }
    if (deploymentId) {
      await db
        .update(tenantDeployments)
        .set({ status: "failed", lastError: message, updatedAt: new Date() })
        .where(eq(tenantDeployments.id, deploymentId))
        .catch((error) => recordCleanupError("deployment_status_failed_update", error));
    }
    if (sideEffectsStarted && composeCtx) {
      await trace
        .event("cleanup", "Attempting best-effort compose rollback", {
          level: "warn",
          meta: { composeProjectName: composeCtx.project },
        })
        .catch((error) => recordCleanupError("cleanup_event_before_rollback", error));
      const rolledBack = await composeDownBestEffort(deps.docker, composeCtx);
      if (rolledBack && tenantId) {
        await db
          .delete(tenants)
          .where(eq(tenants.id, tenantId))
          .catch((error) => recordCleanupError("tenant_delete_after_rollback", error));
        await trace
          .event("cleanup", "Compose rollback completed and tenant records removed", {
            level: "info",
            meta: { composeProjectName: composeCtx.project, tenantId },
          })
          .catch((error) => recordCleanupError("cleanup_event_after_rollback", error));
      } else if (!rolledBack) {
        await trace
          .event("cleanup", "Compose rollback failed; tenant marked failed for operator recovery", {
            level: "error",
            meta: { composeProjectName: composeCtx.project, tenantId, deploymentId },
          })
          .catch((error) => recordCleanupError("cleanup_event_rollback_failed", error));
      }
    }
    await trace
      .event("failed", message, { level: "error", meta: { cause: String(err) } })
      .catch((error) => recordCleanupError("final_failed_event", error));
    log(`[provision] failed slug=${input.slug} correlationId=${correlationId}: ${message}`);
    return { ok: false, message, cause: String(err) };
  }
}
