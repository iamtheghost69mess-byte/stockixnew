import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { createConnection } from "node:net";

import { adminAuditLog, tenantDeployments, tenantProvisionEvents, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import { execa } from "execa";

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

// ─────────────────────────────────────────────────────────────────────────────
// Shared infrastructure helpers
// ─────────────────────────────────────────────────────────────────────────────

function sharedMysqlHost(): string {
  return process.env.SHARED_MYSQL_HOST ?? "shared-mysql";
}

function sharedMysqlRootPassword(): string {
  return process.env.SHARED_MYSQL_ROOT_PASSWORD ?? "";
}

function sharedMongoHost(): string {
  return process.env.SHARED_MONGO_HOST ?? "shared-mongo";
}

/**
 * Sanitize a tenant slug for use as a MySQL identifier and username.
 * MySQL usernames max 32 chars.
 */
function slugToMysqlSafe(slug: string): string {
  return slug.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 28);
}

/**
 * Provision tenant databases on shared infrastructure.
 * Called BEFORE docker compose up.
 *
 * MySQL  → CREATE DATABASE + CREATE USER + GRANT (via mysql2, already in api deps).
 * MongoDB → database auto-created by Finance on first write.
 *           We verify shared-mongo is reachable via TCP ping only.
 */
export async function provisionTenantDatabases(
  slug: string,
  dbPassword: string,
  log: (m: string) => void,
): Promise<void> {
  const safe = slugToMysqlSafe(slug);
  const financeDb = `stockix_${safe}_finance`;
  const systemDb  = `stockix_${safe}_system`;
  const tenantUser = `tenant_${safe}`;
  const mysqlHost  = sharedMysqlHost();
  const rootPassword = sharedMysqlRootPassword();

  if (!rootPassword) {
    throw new Error(
      "[db-provision] SHARED_MYSQL_ROOT_PASSWORD is not set — cannot provision tenant databases",
    );
  }

  log(`[db-provision] creating MySQL databases for tenant "${slug}"`);

  // mysql2 is in apps/api/package.json — available via tsup bundling
  const mysql2 = await import("mysql2/promise");
  const conn = await mysql2.createConnection({
    host: mysqlHost,
    port: 3306,
    user: "root",
    password: rootPassword,
    connectTimeout: 15_000,
  });

  try {
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${financeDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${systemDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.execute(
      `CREATE USER IF NOT EXISTS '${tenantUser}'@'%' IDENTIFIED BY ?`,
      [dbPassword],
    );
    await conn.execute(
      `GRANT ALL PRIVILEGES ON \`${financeDb}\`.* TO '${tenantUser}'@'%'`,
    );
    await conn.execute(
      `GRANT ALL PRIVILEGES ON \`${systemDb}\`.* TO '${tenantUser}'@'%'`,
    );
    await conn.execute("FLUSH PRIVILEGES");
    log(`[db-provision] MySQL ready: ${financeDb}, ${systemDb}, user: ${tenantUser}`);
  } finally {
    await conn.end();
  }

  // Verify MongoDB reachable via TCP — no mongodb driver needed.
  // The Finance server auto-creates the {slug}_pos database on first write.
  log(`[db-provision] verifying shared-mongo reachability for tenant "${slug}"`);
  await verifyTcpReachable(sharedMongoHost(), 27017, "shared-mongo");
  log(`[db-provision] shared-mongo reachable — ${slug}_pos will be auto-created on first write`);
}

/**
 * Drop tenant databases from shared infrastructure.
 * Called AFTER docker compose down during deprovision.
 *
 * MySQL   → DROP DATABASE + DROP USER (via mysql2).
 * MongoDB → DROP DATABASE via mongosh CLI (execa — already bundled in worker).
 */
export async function deprovisionTenantDatabases(
  slug: string,
  log: (m: string) => void,
): Promise<void> {
  const safe = slugToMysqlSafe(slug);
  const financeDb  = `stockix_${safe}_finance`;
  const systemDb   = `stockix_${safe}_system`;
  const tenantUser = `tenant_${safe}`;
  const rootPassword = sharedMysqlRootPassword();

  // ── MySQL cleanup ──────────────────────────────────────────────────────────
  if (!rootPassword) {
    log(`[db-deprovision] SHARED_MYSQL_ROOT_PASSWORD not set — skipping MySQL cleanup for "${slug}"`);
  } else {
    log(`[db-deprovision] dropping MySQL databases for tenant "${slug}"`);
    try {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection({
        host: sharedMysqlHost(),
        port: 3306,
        user: "root",
        password: rootPassword,
        connectTimeout: 15_000,
      });
      try {
        await conn.execute(`DROP DATABASE IF EXISTS \`${financeDb}\``);
        await conn.execute(`DROP DATABASE IF EXISTS \`${systemDb}\``);
        await conn.execute(`DROP USER IF EXISTS '${tenantUser}'@'%'`);
        await conn.execute("FLUSH PRIVILEGES");
        log(`[db-deprovision] MySQL cleaned: ${financeDb}, ${systemDb}, user: ${tenantUser}`);
      } finally {
        await conn.end();
      }
    } catch (err) {
      log(`[db-deprovision] MySQL cleanup warning: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── MongoDB cleanup via mongosh CLI (no mongodb npm package needed) ────────
  // mongosh is available inside the shared-mongo container.
  // We exec into it via docker exec using the execa runner already in the worker.
  log(`[db-deprovision] dropping MongoDB database "${slug}_pos"`);
  try {
    const mongoHost = sharedMongoHost();
    await execa("docker", [
      "exec",
      // Container name follows the shared compose project naming convention
      "stockix-shared-shared-mongo-1",
      "mongosh",
      "--host", `${mongoHost}:27017`,
      "--quiet",
      "--eval",
      `db.getSiblingDB('${slug}_pos').dropDatabase()`,
    ], { stdio: "pipe" });
    log(`[db-deprovision] MongoDB database "${slug}_pos" dropped`);
  } catch (err) {
    // Non-fatal — if the DB never got written to it may not exist
    log(`[db-deprovision] MongoDB cleanup warning: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** TCP-level reachability check — no driver dependencies. */
function verifyTcpReachable(host: string, port: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port, timeout: 10_000 }, () => {
      socket.destroy();
      resolve();
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`[db-provision] ${label} at ${host}:${port} not reachable (timeout)`));
    });
    socket.on("error", (err) => {
      reject(new Error(`[db-provision] ${label} at ${host}:${port} not reachable: ${err.message}`));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — unchanged signatures, new database lifecycle hooks
// ─────────────────────────────────────────────────────────────────────────────

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
    if (options.removeVolumes) downArgs.push("-v");
    if (options.removeImages) downArgs.push("--rmi", "local");
    await dockerRunner.run(composeFile, project, envPath, composeEnv, downArgs, { timeoutMs: 2 * 60 * 1000 });
    dockerStatus = "stopped";
  } catch {
    dockerStatus = "skipped";
  }

  // Clean up shared infrastructure AFTER containers are down
  await deprovisionTenantDatabases(row.slug, log).catch((err) => {
    log(`[deprovision] database cleanup warning: ${err instanceof Error ? err.message : String(err)}`);
  });

  await edgePublisher.unpublish(row.slug).catch((error) => {
    log(`edge unpublish failed for ${row.slug}: ${error instanceof Error ? error.message : String(error)}`);
  });
  await removePosTraefikConfig(row.slug).catch((error) => {
    log(`pos edge unpublish failed for ${row.slug}: ${error instanceof Error ? error.message : String(error)}`);
  });

  await db.delete(tenantProvisionEvents).where(eq(tenantProvisionEvents.tenantId, tenantId));
  await db.delete(adminAuditLog).where(eq(adminAuditLog.targetTenantId, tenantId));
  await db.delete(tenantDeployments).where(eq(tenantDeployments.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await rm(join(defaultTenantEnvRoot(), row.slug), { recursive: true, force: true }).catch(() => undefined);

  log(`deprovision done for ${project}`);
  return { ok: true, slug: row.slug, composeProject: project, docker: dockerStatus };
}