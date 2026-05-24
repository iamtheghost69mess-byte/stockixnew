import { rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { adminAuditLog, tenantDeployments, tenantProvisionEvents, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";

import { defaultTenantEnvRoot } from "./env-paths.js";
import { getTenantStackPaths } from "./provision-paths.js";
import { composeProjectName } from "./provisioning/compose-project-name.js";
import { TenantProvisionService } from "./provisioning/tenant-provision-service.js";
import type { DeprovisionOptions, DeprovisionResult, ProvisionInput, ProvisionResult } from "./provisioning/types.js";
import { CryptoTenantSecretGenerator } from "./provisioning/adapters/crypto-tenant-secret-generator.js";
import { ExecaDockerComposeRunner } from "./provisioning/adapters/execa-docker-compose-runner.js";
import { FetchStockixFinanceBootstrap } from "./provisioning/adapters/fetch-stockix-finance-bootstrap.js";
import { TraefikEdgePublisher } from "./provisioning/adapters/traefik-edge-publisher.js";
import { removePosTraefikConfig } from "./traefik-config.js";

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
  assertNotCancelled?: () => Promise<void>,
): Promise<ProvisionResult> {
  return tenantProvisionService.provision(db, input, log, correlationId, assertNotCancelled);
}

export async function deprovisionTenant(
  db: PostgresJsDatabase<typeof dbSchema>,
  tenantId: string,
  options: DeprovisionOptions = {},
): Promise<DeprovisionResult> {
  const log = options.log ?? (() => undefined);
  const found = await db
    .select({ id: tenants.id, slug: tenants.slug, composeProject: tenantDeployments.composeProjectName })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const row = found[0];
  if (!row) return { ok: false, message: "Tenant not found" };

  const project = row.composeProject ?? composeProjectName(row.slug);
  const { tenantComposeFile: composeFile, stockixFinanceRoot } = getTenantStackPaths();
  const envPath = join(defaultTenantEnvRoot(), row.slug, ".env");
  const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot, COMPOSE_PROJECT_NAME: project };
  let dockerStatus: "stopped" | "skipped" | "failed" = "skipped";
  try {
    await stat(envPath);
    const downArgs = ["down", "--remove-orphans", "--timeout", "30"];
    if (options.removeVolumes) {
      downArgs.push("-v");
    }
    if (options.removeImages) {
      downArgs.push("--rmi", "local");
    }
    await dockerRunner.run(composeFile, project, envPath, composeEnv, downArgs, { timeoutMs: 2 * 60 * 1000 });
    dockerStatus = "stopped";
  } catch {
    dockerStatus = "skipped";
  }

  await edgePublisher.unpublish(row.slug).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    log(`edge unpublish failed for ${row.slug}: ${message}`);
  });
  await removePosTraefikConfig(row.slug).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    log(`pos edge unpublish failed for ${row.slug}: ${message}`);
  });
  await db.delete(tenantProvisionEvents).where(eq(tenantProvisionEvents.tenantId, tenantId));
  await db.delete(adminAuditLog).where(eq(adminAuditLog.targetTenantId, tenantId));
  await db.delete(tenantDeployments).where(eq(tenantDeployments.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await rm(join(defaultTenantEnvRoot(), row.slug), { recursive: true, force: true }).catch(() => undefined);
  log(`deprovision done for ${project}`);
  return { ok: true, slug: row.slug, composeProject: project, docker: dockerStatus };
}
