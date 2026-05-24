import { join } from "node:path";

import { execa } from "execa";

import { apiConfig, posConfig } from "@repo/config";

import { allocateTenantPort } from "@repo/db";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { eq } from "drizzle-orm";

import * as dbSchema from "@repo/db/schema";

import { tenantDeployments } from "@repo/db/schema";



import type { ProvisionTracer } from "../domain/provision-trace.js";

import {

  bootstrapPosOrganization,

  type BootstrapPosOrgResult,

} from "../domain/provisioning/adapters/bootstrap-pos-org.js";

import {

  removePosTraefikConfig,

  writePosTraefikConfig,

} from "../domain/traefik-config.js";



function repoRoot(): string {

  return apiConfig.repoRoot ?? process.cwd();

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



/** True when `PROVISION_MODULE_GATING=1` (any other value disables gating). */

export function isModuleGatingEnabled(): boolean {

  return process.env.PROVISION_MODULE_GATING === "1";

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

};



export type ProvisionPosStackResult = BootstrapPosOrgResult & {

  posUrl: string;

  posApiUrl: string;

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



function buildPosPublicUrls(slug: string): { posUrl: string; posApiUrl: string } {

  const rootDomain = apiConfig.rootDomain || "example.com";

  const scheme = apiConfig.publicBaseUrlScheme || "https";

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

  const posAppRoot = process.env.POS_APP_ROOT ?? join(repoRoot(), "services", "posnew");

  const platformApiKey = posConfig.platformApiKey.trim();

  const { posUrl, posApiUrl } = buildPosPublicUrls(opts.slug);

  const rootDomain = apiConfig.rootDomain || "example.com";



  const { backendPort, frontendPort } = await resolvePosPorts(opts.db, opts.log);



  opts.log(`[provision][pos] compose up project=${project}`);

  await execa(

    "docker",

    ["compose", "-f", composeFile, "-p", project, "up", "-d", "--build"],

    {

      env: {

        ...process.env,

        COMPOSE_PROJECT_NAME: project,

        POS_APP_ROOT: posAppRoot,

        POS_HOST_PORT: String(backendPort),

        POS_FRONTEND_HOST_PORT: String(frontendPort),

        TENANT_ID: opts.tenantId,

        AUTH_TOKEN_SECRET: apiConfig.authTokenSecret ?? "",

        POS_PLATFORM_API_KEY: platformApiKey,

        POS_BACKEND_URL: posApiUrl,

        POS_FRONTEND_URL: posUrl,

        ROOT_DOMAIN: rootDomain,

      },

      stdio: "inherit",

    },

  );



  const bootstrap = await bootstrapPosOrganization({

    slug: opts.slug,

    tenantName: opts.tenantName,

    tenantId: opts.tenantId,

    adminEmail: opts.adminEmail,

    log: opts.log,

    posHostPort: backendPort,

  });



  opts.log(`[provision][pos] publishing Traefik routes pos=${posUrl} api=${posApiUrl}`);

  await writePosTraefikConfig(opts.slug, backendPort, frontendPort, rootDomain);



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

    const result = await provisionPosStack(opts);

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


