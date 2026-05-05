import { stat } from "node:fs/promises";
import { join } from "node:path";

import {
  adminAuditLog,
  tenantDeployments,
  tenantProvisionEvents,
  tenants,
} from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import { eq } from "drizzle-orm";

import { CryptoTenantSecretGenerator } from "./provisioning/adapters/crypto-tenant-secret-generator.js";
import { ExecaDockerComposeRunner } from "./provisioning/adapters/execa-docker-compose-runner.js";
import { FetchStockixFinanceBootstrap } from "./provisioning/adapters/fetch-stockix-finance-bootstrap.js";
import { TraefikEdgePublisher } from "./provisioning/adapters/traefik-edge-publisher.js";
import { composeProjectName } from "./provisioning/compose-project-name.js";
import { TenantProvisionService } from "./provisioning/tenant-provision-service.js";
import type {
  DeprovisionOptions,
  DeprovisionResult,
  ProvisionInput,
  ProvisionResult,
} from "./provisioning/types.js";
import { defaultTenantEnvRoot } from "./env-paths.js";
import { getTenantStackPaths } from "./provision-paths.js";

export type {
  DeprovisionOptions,
  DeprovisionResult,
  ProvisionInput,
  ProvisionResult,
} from "./provisioning/types.js";

/**
 * Stockix `POST /api/auth/login` validates **`crediential`** (typo), not `credential`.
 * Login clients must send `{ crediential: email, password }`.
 */

const dockerRunner = new ExecaDockerComposeRunner();
const edgePublisher = new TraefikEdgePublisher();

const tenantProvisionService = new TenantProvisionService({
  docker: dockerRunner,
  secrets: new CryptoTenantSecretGenerator(),
  finance: new FetchStockixFinanceBootstrap(),
  edge: edgePublisher,
});

export async function provisionTenant(
  db: PostgresJsDatabase<typeof dbSchema>,
  input: ProvisionInput,
  log: (m: string) => void,
  correlationId: string,
): Promise<ProvisionResult> {
  return tenantProvisionService.provision(db, input, log, correlationId);
}

/**
 * Stops the tenant Docker stack (best effort), deletes provision audit rows, then deletes the tenant
 * (cascades deployment + tenant_config). Idempotent if Docker or .env is already gone.
 */
export async function deprovisionTenant(
  db: PostgresJsDatabase<typeof dbSchema>,
  tenantId: string,
  options: DeprovisionOptions = {},
): Promise<DeprovisionResult> {
  const log = options.log ?? (() => undefined);

  const found = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      composeProject: tenantDeployments.composeProjectName,
    })
    .from(tenants)
    .leftJoin(
      tenantDeployments,
      eq(tenantDeployments.tenantId, tenants.id),
    )
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const row = found[0];
  if (!row) {
    return { ok: false, message: "Tenant not found" };
  }

  const slug = row.slug;
  const project = row.composeProject ?? composeProjectName(slug);

  const { tenantComposeFile: composeFile, stockixFinanceRoot } =
    getTenantStackPaths();
  const tenantEnvRoot = defaultTenantEnvRoot();
  const envPath = join(tenantEnvRoot, slug, ".env");
  const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot };

  let dockerStatus: "stopped" | "skipped" | "failed" = "skipped";

  let envPresent = false;
  try {
    await stat(envPath);
    envPresent = true;
  } catch {
    log(`deprovision: no .env at ${envPath} — skipping docker compose`);
    dockerStatus = "skipped";
  }

  if (envPresent) {
    const downArgs = options.removeVolumes
      ? (["down", "--volumes"] as const)
      : (["down"] as const);
    try {
      await dockerRunner.run(composeFile, project, envPath, composeEnv, [
        ...downArgs,
      ]);
      dockerStatus = "stopped";
      log(`docker compose ${downArgs.join(" ")} completed for ${project}`);
    } catch (e) {
      dockerStatus = "failed";
      log(
        `deprovision: docker compose down failed (tenant row still removed): ${String(e)}`,
      );
    }
  }

  await edgePublisher.unpublish(slug).catch(() => undefined);

  await db
    .delete(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.tenantId, tenantId));

  await db
    .delete(adminAuditLog)
    .where(eq(adminAuditLog.targetTenantId, tenantId));

  await db.delete(tenants).where(eq(tenants.id, tenantId));

  return {
    ok: true,
    slug,
    composeProject: project,
    docker: dockerStatus,
  };
}
