import { isAbsolute, join } from "node:path";
import { stat } from "node:fs/promises";

import { execa } from "execa";

import { apiConfig, env, moduleGatingConfig, posConfig } from "@repo/config";
import { publicConfig } from "@repo/config/public";

import { allocateTenantPort, assertTenantPortAvailable } from "@repo/db";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { eq } from "drizzle-orm";

import * as dbSchema from "@repo/db/schema";

import { tenantDeployments } from "@repo/db/schema";

import { defaultTenantEnvRoot } from "../domain/env-paths.js";
import { composeProjectName } from "../domain/provisioning/compose-project-name.js";
import { ExecaDockerComposeRunner } from "../domain/provisioning/adapters/execa-docker-compose-runner.js";

import type { ProvisionTracer } from "../domain/provision-trace.js";
import { buildPosCorsOrigins } from "../domain/provisioning/pos-cors-origins.js";
import { isPosFrontendStubImage } from "../domain/provisioning/check-tenant-images.js";
import { ProvisionError } from "../domain/provisioning/provision-error.js";

import {

  bootstrapPosOrganization,

  type BootstrapPosOrgResult,

} from "../domain/provisioning/adapters/bootstrap-pos-org.js";

import { buildFinanceInternalUrlForPos } from "../domain/provisioning/build-finance-internal-url.js";
import { readTenantEnvFile } from "../domain/provisioning/tenant-env.js";

import {

  removePosTraefikConfig,

  writePosTraefikConfig,

} from "../domain/traefik-config.js";

const posDockerRunner = new ExecaDockerComposeRunner();

/** Tenant `.env` path used for POS compose `--env-file` (mirrors Finance provisioning). */
export function resolvePosTenantEnvPath(slug: string): string {
  return join(defaultTenantEnvRoot(), slug, ".env");
}

async function assertPosTenantEnvFile(slug: string): Promise<string> {
  const envPath = resolvePosTenantEnvPath(slug);
  try {
    await stat(envPath);
  } catch {
    throw new Error(
      `[provision][pos] tenant env file missing: ${envPath}. ` +
        "Ensure writeTenantEnvFileAtomic() runs before POS compose.",
    );
  }
  return envPath;
}

/** JWT / license secrets injected into POS compose env (exported for tests). */
export function resolvePosJwtEnv(): {
  JWT_SECRET: string;
  PLATFORM_JWT_SECRET: string;
  LICENSE_SIGNING_SECRET: string;
  FIELD_ENCRYPTION_KEY: string;
} {
  const jwtSecret = apiConfig.authTokenSecret;
  const platformFromEnv = process.env.PLATFORM_JWT_SECRET?.trim();
  const platformJwtSecret =
    platformFromEnv
    || (apiConfig.nodeEnv !== "production" && jwtSecret
      ? `${jwtSecret}:platform`
      : "");
  if (!platformJwtSecret) {
    throw new Error(
      "[provision][pos] PLATFORM_JWT_SECRET is required when provisioning POS in production",
    );
  }
  return {
    JWT_SECRET: jwtSecret,
    PLATFORM_JWT_SECRET: platformJwtSecret,
    LICENSE_SIGNING_SECRET: apiConfig.licenseSigningSecret,
    FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY?.trim() ?? "",
  };
}

/** Require explicit Resend API key for POS email (no SMTP password fallback). */
export function resolvePosResendApiKey(): string {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "[provision][pos] RESEND_API_KEY is required when provisioning POS (set in platform env)",
    );
  }
  return key;
}

function repoRoot(): string {

  return apiConfig.repoRoot ?? process.cwd();

}

async function dockerImageExists(tag: string): Promise<boolean> {
  try {
    await execa("docker", ["image", "inspect", tag], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}



const DEFAULT_MODULES = ["accounting"] as const;



export function resolveTenantModules(inputModules?: string[] | null): string[] {

  if (!inputModules?.length) {

    return [...DEFAULT_MODULES];

  }

  const filtered = inputModules.filter(

    (m): m is string => typeof m === "string" && m.trim().length > 0,

  );

  return filtered.length > 0 ? filtered : [...DEFAULT_MODULES];

}



/** True when module gating is enabled (default). Only `PROVISION_MODULE_GATING=0` disables it. */
export function isModuleGatingEnabled(): boolean {
  return moduleGatingConfig.enabled;
}



/** Finance stack (`infra/tenant-stack`) runs when tenant modules include `accounting`. */

export function shouldProvisionFinanceStack(modules?: string[] | null): boolean {

  return resolveTenantModules(modules).includes("accounting");

}



export function hasAccountingAndPos(modules: string[]): boolean {

  return modules.includes("accounting") && modules.includes("pos");

}



export function isPosOnlyModules(modules: string[]): boolean {

  const resolved = resolveTenantModules(modules);

  return resolved.includes("pos") && !resolved.includes("accounting");

}



/** Which product stacks to start for a provision job (mirrors `provision-runtime` branching). */

export function getProvisionStackPlan(inputModules?: string[] | null): {

  finance: boolean;

  pos: boolean;

  pms: boolean;

  chat: boolean;

} {

  const modules = resolveTenantModules(inputModules);

  const moduleGating = isModuleGatingEnabled();

  const finance =

    !moduleGating || shouldProvisionFinanceStack(modules);

  return {

    finance,

    pos: modules.includes("pos"),

    pms: modules.includes("pms"),

    chat: modules.includes("chat"),

  };

}



export type ProvisionPosStackInput = {

  slug: string;

  tenantId: string;

  tenantName: string;

  adminEmail: string;

  log: (m: string) => void;

  db?: PostgresJsDatabase<typeof dbSchema>;

  /** Stockix license expiry passed to POS org bootstrap. */
  licenseExpiresAt?: Date | null;

  /** Finance stack host port (for POS container → Finance URL). */

  financeInternalPort?: number;

  /** Stockix licensed modules for POS entitlements. */
  tenantModules?: string[];

  planSlug?: string;

  maxUsers?: number | null;

  maxLocations?: number | null;

  maxOrdersPerMonth?: number | null;

  trace?: ProvisionTracer;

  hasOp?: (key: string) => boolean;

  markOp?: (key: string, msg: string, meta?: Record<string, unknown>) => Promise<void>;

  posOrganizationId?: string;

  posUrl?: string;

  posApiUrl?: string;

};



export type ProvisionPosStackResult = BootstrapPosOrgResult & {

  posUrl: string;

  posApiUrl: string;

  posHostPort: number;

};



function defaultPosBackendPort(): number {

  const raw = process.env.POS_HOST_PORT ?? "8010";

  const port = Number(raw);

  return Number.isFinite(port) && port > 0 ? port : 8010;

}



function defaultPosFrontendPort(): number {

  const raw = process.env.POS_FRONTEND_HOST_PORT ?? "3001";

  const port = Number(raw);

  return Number.isFinite(port) && port > 0 ? port : 3001;

}



function buildPosPublicUrls(
  slug: string,
  ports: { backendPort: number; frontendPort: number },
): { posUrl: string; posApiUrl: string } {
  const rootDomain = apiConfig.rootDomain || "example.com";
  const scheme = (apiConfig.publicBaseUrlScheme || "https").replace(/:+$/, "");
  if (rootDomain === "localhost") {
    const host = publicConfig.stockixLocalTenantHost || "127.0.0.1";
    return {
      posUrl: `${scheme}://${host}:${ports.frontendPort}`,
      posApiUrl: `${scheme}://${host}:${ports.backendPort}`,
    };
  }
  return {
    posUrl: `${scheme}://${slug}-pos.${rootDomain}`,
    posApiUrl: `${scheme}://${slug}-pos-api.${rootDomain}`,
  };
}



async function resolvePosPorts(

  db: PostgresJsDatabase<typeof dbSchema> | undefined,

  log: (m: string) => void,

): Promise<{ backendPort: number; frontendPort: number }> {

  if (!db) {

    return {

      backendPort: defaultPosBackendPort(),

      frontendPort: defaultPosFrontendPort(),

    };

  }

  const maxPort = apiConfig.maxTenantPort;

  const backendPort = await allocateTenantPort(db, maxPort);

  const frontendPort = await allocateTenantPort(db, maxPort);

  log(`[provision][pos] allocated ports backend=${backendPort} frontend=${frontendPort}`);

  return { backendPort, frontendPort };

}



export async function provisionPosStack(

  opts: ProvisionPosStackInput,

): Promise<ProvisionPosStackResult> {

  const composeFile = join(repoRoot(), "infra", "pos-tenant-stack", "docker-compose.yml");

  const project = `stockix-pos-${opts.slug}`;

  const posAppRootRaw = process.env.POS_APP_ROOT ?? join("services", "posnew");
  const posAppRoot = isAbsolute(posAppRootRaw)
    ? posAppRootRaw
    : join(repoRoot(), posAppRootRaw);

  const platformApiKey = posConfig.platformApiKey.trim();

  const rootDomain = apiConfig.rootDomain || "example.com";

  const { backendPort, frontendPort } = await resolvePosPorts(opts.db, opts.log);

  const { posUrl, posApiUrl } = buildPosPublicUrls(opts.slug, { backendPort, frontendPort });

  const financeInternalBaseUrl =
    opts.financeInternalPort && opts.financeInternalPort > 0
      ? buildFinanceInternalUrlForPos({
          slug: opts.slug,
          internalPort: opts.financeInternalPort,
        })
      : "";



  opts.log(`[provision][pos] compose up project=${project}`);

  const stockixRepoRoot = repoRoot();
  const resendApiKey = resolvePosResendApiKey();
  const resendFromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() || env.MAIL_FROM_ADDRESS?.trim() || "";
  const posJwtEnv = resolvePosJwtEnv();

  const tenantEnv = await readTenantEnvFile(opts.slug);
  const envPath = await assertPosTenantEnvFile(opts.slug);
  const requiredVars = ["MONGODB_URI", "REDIS_URL", "REDIS_KEY_PREFIX"];
  const missing = requiredVars.filter((k) => !tenantEnv[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `[provision][pos] Cannot start POS stack — missing env vars: ${missing.join(", ")}. ` +
        "Ensure writeTenantEnvFileAtomic() runs before provisionPosStack().",
    );
  }

  const composeEnv = {
    ...process.env,
    ...tenantEnv,
    COMPOSE_PROJECT_NAME: project,
    STOCKIX_REPO_ROOT: stockixRepoRoot,
    POS_APP_ROOT: posAppRoot,
    POS_HOST_PORT: String(backendPort),
    POS_FRONTEND_HOST_PORT: String(frontendPort),
    TENANT_ID: opts.tenantId,
    AUTH_TOKEN_SECRET: apiConfig.authTokenSecret ?? "",
    ...posJwtEnv,
    POS_PLATFORM_API_KEY: platformApiKey,
    POS_BACKEND_URL: posApiUrl,
    POS_FRONTEND_URL: posUrl,
    CORS_ORIGINS: buildPosCorsOrigins(opts.slug),
    ROOT_DOMAIN: rootDomain,
    RESEND_API_KEY: resendApiKey,
    RESEND_FROM_EMAIL: resendFromEmail,
    ...(financeInternalBaseUrl
      ? { FINANCE_INTERNAL_BASE_URL: financeInternalBaseUrl }
      : {}),
  };

  if (!(await dockerImageExists("stockix-pos-backend:local"))) {
    throw new Error(
      "stockix-pos-backend:local not found — run pnpm pos:images:build before POS provision",
    );
  }
  if (!(await dockerImageExists("stockix-pos-frontend:local"))) {
    throw new Error(
      "stockix-pos-frontend:local not found — run pnpm pos:images:build before POS provision",
    );
  }
  if (await isPosFrontendStubImage()) {
    throw new ProvisionError(
      "POS frontend image is a stub build. " +
        "Run `pnpm pos:images:build` (not `pnpm pos:images:build:stub`) " +
        "to build the real frontend image before provisioning POS.",
      "POS_FRONTEND_STUB_IMAGE",
    );
  }

  const upServices = [
    "pos-backend",
    "pos-platform-worker",
    "pos-bigcapital-worker",
    "pos-frontend",
  ];

  // Use pre-built images only — do not pass --build (would rebuild pos-frontend from the full Next Dockerfile).
  try {
    await posDockerRunner.run(
      composeFile,
      project,
      envPath,
      composeEnv,
      ["up", "-d", "--no-build", ...upServices],
      {
        onOutput: (chunk) => {
          for (const line of chunk.split("\n")) {
            const trimmed = line.trim();
            if (trimmed) opts.log(`[provision][pos][compose] ${trimmed}`);
          }
        },
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`POS compose failed: ${msg}`);
  }



  let bootstrap: Awaited<ReturnType<typeof bootstrapPosOrganization>>;
  if (opts.trace && opts.hasOp?.("pos.bootstrap_organization")) {
    opts.log?.("[provision][pos] Skipping POS org bootstrap (already journaled)");
    bootstrap = {
      posOrganizationId: opts.posOrganizationId ?? "",
      posUrl: opts.posUrl ?? "",
      posApiUrl: opts.posApiUrl ?? "",
    } as unknown as Awaited<ReturnType<typeof bootstrapPosOrganization>>;
  } else {
    bootstrap = await bootstrapPosOrganization({

      slug: opts.slug,

      tenantName: opts.tenantName,

      tenantId: opts.tenantId,

      adminEmail: opts.adminEmail,

      log: opts.log,

      licenseExpiresAt: opts.licenseExpiresAt,

      tenantModules: opts.tenantModules,

      maxUsers: opts.maxUsers,

      maxLocations: opts.maxLocations,

      maxOrdersPerMonth: opts.maxOrdersPerMonth,

      posHostPort: backendPort,

    });
    await opts.markOp?.("pos.bootstrap_organization", "POS organization bootstrapped", {
      posOrganizationId: bootstrap.posOrganizationId,
    });
  }



  if (rootDomain === "localhost") {
    opts.log(
      `[provision][pos] localhost dev: skipping Traefik (open POS at ${posUrl})`,
    );
  } else {
    if (opts.db) {
      await assertTenantPortAvailable(opts.db, backendPort, {
        excludeTenantId: opts.tenantId,
        slug: opts.slug,
      });
      await assertTenantPortAvailable(opts.db, frontendPort, {
        excludeTenantId: opts.tenantId,
        slug: opts.slug,
      });
    }
    opts.log(`[provision][pos] publishing Traefik routes pos=${posUrl} api=${posApiUrl}`);
    await writePosTraefikConfig(opts.slug, backendPort, frontendPort, rootDomain);
  }



  if (opts.db) {

    await opts.db

      .update(tenantDeployments)

      .set({

        posOrganizationId: bootstrap.posOrganizationId,

        posUrl,

        updatedAt: new Date(),

      })

      .where(eq(tenantDeployments.tenantId, opts.tenantId));

    opts.log(

      `[provision][pos] saved pos_organization_id=${bootstrap.posOrganizationId} pos_url=${posUrl}`,

    );

  }



  return {

    ...bootstrap,

    posUrl,

    posApiUrl,

    posHostPort: backendPort,

  };

}



/** Provision POS stack and emit `pos.stack.completed` / `pos.stack.failed` trace events. */

export async function provisionPosStackTracked(

  opts: ProvisionPosStackInput,

  trace?: ProvisionTracer,

): Promise<ProvisionPosStackResult> {

  await trace?.event("progress", "Starting POS stack provisioning", {

    meta: { operationKey: "pos.stack" },

  });

  try {

    const result = await provisionPosStack({
      ...opts,
      trace: opts.trace ?? trace,
    });

    await trace?.event("pos.stack.completed", "POS stack provisioned successfully", {

      meta: {

        posOrganizationId: result.posOrganizationId,

        posUrl: result.posUrl,

        posApiUrl: result.posApiUrl,

      },

    });

    return result;

  } catch (error) {

    const msg = error instanceof Error ? error.message : String(error);

    await unpublishPosTraefik(opts.slug).catch(() => undefined);

    await trace?.event("pos.stack.failed", `POS stack failed: ${msg}`, {

      level: "error",

      meta: { error: msg },

    });

    throw error;

  }

}



/** Remove POS Traefik dynamic config (best-effort). */

export async function unpublishPosTraefik(slug: string): Promise<void> {

  await removePosTraefikConfig(slug);

}

/** Stop Finance tenant stack (remove accounting module). Data volumes are retained. */
export async function stopFinanceStack(
  slug: string,
  log: (m: string) => void,
): Promise<void> {
  const composeFile = join(repoRoot(), "infra", "tenant-stack", "docker-compose.yml");
  const project = composeProjectName(slug);
  log(`[module-stop][accounting] compose stop project=${project}`);
  await execa(
    "docker",
    ["compose", "-f", composeFile, "-p", project, "stop"],
    { stdio: "pipe", reject: false },
  );
}

/** Stop a module stack without removing volumes (remove-module). */
export async function stopModuleStack(
  slug: string,
  module: "pos" | "pms",
  log: (m: string) => void,
): Promise<void> {
  if (module === "pos") {
    const composeFile = join(repoRoot(), "infra", "pos-tenant-stack", "docker-compose.yml");
    const project = `stockix-pos-${slug}`;
    const envPath = resolvePosTenantEnvPath(slug);
    let composeEnv: Record<string, string> = {
      ...process.env,
      COMPOSE_PROJECT_NAME: project,
    } as Record<string, string>;
    try {
      composeEnv = { ...composeEnv, ...(await readTenantEnvFile(slug)) };
    } catch {
      // Best-effort teardown when env file is missing.
    }
    log(`[module-stop][pos] compose down project=${project}`);
    await posDockerRunner.run(
      composeFile,
      project,
      envPath,
      composeEnv,
      ["down", "--remove-orphans"],
      { timeoutMs: 2 * 60 * 1000 },
    ).catch((error) => {
      log(
        `[module-stop][pos] compose down warning: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    await unpublishPosTraefik(slug);
    return;
  }
  const composeFile = join(repoRoot(), "infra", "pms-tenant-stack", "docker-compose.yml");
  const project = `stockix-pms-${slug}`;
  log(`[module-stop][pms] compose down project=${project}`);
  await execa(
    "docker",
    ["compose", "-f", composeFile, "-p", project, "down", "--remove-orphans"],
    { stdio: "pipe", reject: false },
  );
}



export async function provisionPmsStack(opts: {

  slug: string;

  tenantId: string;

  log: (m: string) => void;

}): Promise<void> {

  const composeFile = join(repoRoot(), "infra", "pms-tenant-stack", "docker-compose.yml");

  const project = `stockix-pms-${opts.slug}`;

  const pmsAppRoot = process.env.PMS_APP_ROOT ?? join(repoRoot(), "services", "pms");

  opts.log(`[provision][pms] compose up project=${project}`);

  await execa(

    "docker",

    ["compose", "-f", composeFile, "-p", project, "up", "-d", "--build"],

    {

      env: {

        ...process.env,

        COMPOSE_PROJECT_NAME: project,

        PMS_APP_ROOT: pmsAppRoot,

        TENANT_ID: opts.tenantId,

        AUTH_TOKEN_SECRET: apiConfig.authTokenSecret ?? "",

        PLATFORM_API_SECRET: apiConfig.platformApiSecret ?? "",

        DATABASE_URL: process.env.DATABASE_URL ?? "",

      },

      stdio: "inherit",

    },

  );

}


