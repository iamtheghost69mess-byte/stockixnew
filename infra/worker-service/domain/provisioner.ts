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
import { getRepoRoot } from "./repo-root.js";
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

async function getComposeContainerName(
  project: string,
  composeFile: string,
  service: string,
): Promise<string | null> {
  try {
    const { stdout } = await execa(
      "docker",
      ["compose", "-f", composeFile, "-p", project, "ps", "-q", service],
      { stdio: "pipe" },
    );
    const id = stdout.trim().split("\n").find((line) => line.trim())?.trim();
    if (!id) return null;
    const { stdout: nameOut } = await execa(
      "docker",
      ["inspect", "-f", "{{.Name}}", id],
      { stdio: "pipe" },
    );
    const name = nameOut.trim().replace(/^\//, "");
    return name || null;
  } catch {
    return null;
  }
}

async function flushTenantRedisKeys(slug: string, log: (m: string) => void): Promise<boolean> {
  const repoRoot = getRepoRoot();
  const sharedComposeFile = join(repoRoot, "infra", "shared", "docker-compose.yml");
  const redisContainer = await getComposeContainerName(
    "stockix-shared",
    sharedComposeFile,
    "stockix-redis",
  );
  if (!redisContainer) {
    log(`[db-deprovision] shared redis container not found — skipping Redis flush for "${slug}"`);
    return false;
  }

  const pattern = `tenant:${slug}:*`;
  try {
    const { stdout } = await execa(
      "docker",
      [
        "exec",
        redisContainer,
        "redis-cli",
        "EVAL",
        "local c='0'; local n=0; repeat local r=redis.call('SCAN',c,'MATCH',ARGV[1],'COUNT',100); c=r[1]; for _,k in ipairs(r[2]) do redis.call('DEL',k); n=n+1 end until c=='0'; return n",
        "0",
        pattern,
      ],
      { stdio: "pipe" },
    );
    const count = Number.parseInt(stdout.trim(), 10);
    log(
      `[db-deprovision] flushed ${Number.isFinite(count) ? count : 0} Redis keys matching ${pattern}`,
    );
    return true;
  } catch (err) {
    log(
      `[db-deprovision] Redis flush warning: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * Sanitize a tenant slug for use as a MySQL identifier and username.
 * MySQL usernames max 32 chars.
 */
export function slugToMysqlSafe(slug: string): string {
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
    // NOTE: stockix_{safe}_finance is provisioned for legacy compatibility.
    // Finance TenantDBManager uses stockix_{safe}_{organizationId} at runtime.
    // Do not drop _finance on deprovision — it may be referenced by some modules.
    // Track in Architecture2.md P1 — orphan DB audit pending.
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
    // Wildcard grant covers org-level DBs created at runtime by Finance
    // TenantDBManager: stockix_{safe}_{organizationId} (uses tenant SYSTEM_DB_USER via knex-db-manager)
    await conn.execute(
      `GRANT ALL PRIVILEGES ON \`stockix_${safe}_%\`.* TO '${tenantUser}'@'%'`,
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
export type DeprovisionDataPlaneResult = {
  mysqlDbs: boolean;
  mongoDb: boolean;
  redisKeys: boolean;
};

export async function deprovisionTenantDatabases(
  slug: string,
  log: (m: string) => void,
): Promise<DeprovisionDataPlaneResult> {
  const safe = slugToMysqlSafe(slug);
  const financeDb  = `stockix_${safe}_finance`;
  const systemDb   = `stockix_${safe}_system`;
  const tenantUser = `tenant_${safe}`;
  const rootPassword = sharedMysqlRootPassword();
  const result: DeprovisionDataPlaneResult = {
    mysqlDbs: false,
    mongoDb: false,
    redisKeys: false,
  };

  // ── MySQL cleanup ──────────────────────────────────────────────────────────
  if (!rootPassword) {
    throw new Error(
      "[deprovision] SHARED_MYSQL_ROOT_PASSWORD is not set. " +
        "Cannot safely remove tenant MySQL databases. " +
        "Deprovision aborted — Postgres rows NOT deleted. " +
        "Set the password and retry, or manually drop: " +
        `stockix_${safe}_% and revoke tenant_${safe}`,
    );
  }

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

      const [orgRows] = await conn.query<Array<{ schemaName: string }>>(
        `SELECT schema_name AS schemaName FROM information_schema.schemata WHERE schema_name LIKE ?`,
        [`stockix_${safe}_%`],
      );
      for (const row of orgRows) {
        const dbName = row.schemaName;
        if (!dbName) continue;
        await conn.execute(`DROP DATABASE IF EXISTS \`${dbName}\``);
        log(`[db-deprovision] Dropped DB: ${dbName}`);
      }

      await conn.execute(`DROP USER IF EXISTS '${tenantUser}'@'%'`);
      await conn.execute("FLUSH PRIVILEGES");
      log(`[db-deprovision] MySQL cleaned for tenant "${slug}" (user: ${tenantUser})`);
      result.mysqlDbs = true;
    } finally {
      await conn.end();
    }
  } catch (err) {
    log(`[db-deprovision] MySQL cleanup warning: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── MongoDB cleanup via mongosh CLI (no mongodb npm package needed) ────────
  log(`[db-deprovision] dropping MongoDB database "${slug}_pos"`);
  try {
    const repoRoot = getRepoRoot();
    const sharedComposeFile = join(repoRoot, "infra", "shared", "docker-compose.yml");
    const mongoContainer = await getComposeContainerName(
      "stockix-shared",
      sharedComposeFile,
      "stockix-mongo",
    );
    if (!mongoContainer) {
      log(`[db-deprovision] shared mongo container not found — skipping Mongo cleanup for "${slug}"`);
    } else {
      const mongoHost = sharedMongoHost();
      // Mongo DB name uses raw slug (not slugToMysqlSafe) intentionally.
      // MongoDB supports the full slug character set. Must match buildTenantMongoUrl() in tenant-env.ts.
      // Allowed slug characters: [a-z0-9-] enforced at tenant creation (apps/api provisionBody).
      await execa("docker", [
        "exec",
        mongoContainer,
        "mongosh",
        "--host", `${mongoHost}:27017`,
        "--quiet",
        "--eval",
        `db.getSiblingDB('${slug}_pos').dropDatabase()`,
      ], { stdio: "pipe" });
      log(`[db-deprovision] MongoDB database "${slug}_pos" dropped`);
      result.mongoDb = true;
    }
  } catch (err) {
    log(`[db-deprovision] MongoDB cleanup warning: ${err instanceof Error ? err.message : String(err)}`);
  }

  result.redisKeys = await flushTenantRedisKeys(slug, log);
  return result;
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
  lifecycleJobId?: string,
): Promise<ProvisionResult> {
  return tenantProvisionService.provision(
    db,
    input,
    log,
    correlationId,
    assertNotCancelled,
    lifecycleJobId,
  );
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

  const safe = slugToMysqlSafe(row.slug);
  const rootPassword = sharedMysqlRootPassword();
  // CRITICAL: Never delete Postgres tenant rows until data plane
  // cleanup succeeds. Orphaned shared DB data is a security risk.
  if (!rootPassword) {
    throw new Error(
      "[deprovision] SHARED_MYSQL_ROOT_PASSWORD is not set. " +
        "Cannot safely remove tenant MySQL databases. " +
        "Deprovision aborted — Postgres rows NOT deleted. " +
        "Set the password and retry, or manually drop: " +
        `stockix_${safe}_% and revoke tenant_${safe}`,
    );
  }

  const project = row.composeProject ?? composeProjectName(row.slug);
  const { tenantComposeFile: composeFile, stockixFinanceRoot } = getTenantStackPaths();
  const envPath = join(defaultTenantEnvRoot(), row.slug, ".env");
  const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot, COMPOSE_PROJECT_NAME: project };
  let dockerStatus: "stopped" | "skipped" | "failed" = "skipped";

  // Deprovision ordering: data plane first, control plane last.
  // Never delete Postgres rows until all shared resources confirmed clean.
  const cleanupResults = {
    financeCompose: false,
    posCompose: false,
    pmsCompose: false,
    mysqlDbs: false,
    mongoDb: false,
    redisKeys: false,
    traefikYaml: false,
    envDir: false,
    postgresRows: false,
  };

  try {
    await stat(envPath);
    const downArgs = ["down", "--remove-orphans", "--timeout", "30"];
    if (options.removeVolumes) downArgs.push("-v");
    if (options.removeImages) downArgs.push("--rmi", "local");
    await dockerRunner.run(composeFile, project, envPath, composeEnv, downArgs, { timeoutMs: 2 * 60 * 1000 });
    dockerStatus = "stopped";
    cleanupResults.financeCompose = true;

    const repoRoot = getRepoRoot();
    const moduleComposeEnv = {
      ...composeEnv,
      STOCKIX_REPO_ROOT: repoRoot,
      COMPOSE_PROJECT_NAME: project,
    };

    const posProject = `stockix-pos-${row.slug}`;
    const posComposeFile = join(repoRoot, "infra", "pos-tenant-stack", "docker-compose.yml");
    try {
      await dockerRunner.run(
        posComposeFile,
        posProject,
        envPath,
        { ...moduleComposeEnv, COMPOSE_PROJECT_NAME: posProject },
        ["down", "--remove-orphans", "--timeout", "30"],
        { timeoutMs: 2 * 60 * 1000 },
      );
      log(`[deprovision] POS stack ${posProject} removed`);
      cleanupResults.posCompose = true;
    } catch (err) {
      log(
        `[deprovision] POS stack teardown failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const pmsProject = `stockix-pms-${row.slug}`;
    const pmsComposeFile = join(repoRoot, "infra", "pms-tenant-stack", "docker-compose.yml");
    try {
      await dockerRunner.run(
        pmsComposeFile,
        pmsProject,
        envPath,
        { ...moduleComposeEnv, COMPOSE_PROJECT_NAME: pmsProject },
        ["down", "--remove-orphans", "--timeout", "30"],
        { timeoutMs: 2 * 60 * 1000 },
      );
      log(`[deprovision] PMS stack ${pmsProject} removed`);
      cleanupResults.pmsCompose = true;
    } catch (err) {
      log(
        `[deprovision] PMS stack teardown failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } catch {
    dockerStatus = "skipped";
  }

  // Clean up shared infrastructure AFTER containers are down
  const dataPlane = await deprovisionTenantDatabases(row.slug, log);
  cleanupResults.mysqlDbs = dataPlane.mysqlDbs;
  cleanupResults.mongoDb = dataPlane.mongoDb;
  cleanupResults.redisKeys = dataPlane.redisKeys;

  let financeTraefikRemoved = false;
  let posTraefikRemoved = false;
  try {
    await edgePublisher.unpublish(row.slug);
    financeTraefikRemoved = true;
  } catch (error) {
    log(`edge unpublish failed for ${row.slug}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await removePosTraefikConfig(row.slug);
    posTraefikRemoved = true;
  } catch (error) {
    log(`pos edge unpublish failed for ${row.slug}: ${error instanceof Error ? error.message : String(error)}`);
  }
  cleanupResults.traefikYaml = financeTraefikRemoved && posTraefikRemoved;

  const dataPlaneClean =
    cleanupResults.mysqlDbs && cleanupResults.mongoDb && cleanupResults.redisKeys;
  if (!dataPlaneClean) {
    const failed = Object.entries(cleanupResults)
      .filter(([key, ok]) => !ok && ["mysqlDbs", "mongoDb", "redisKeys"].includes(key))
      .map(([key]) => key);
    throw new Error(
      `[deprovision] Data plane cleanup incomplete: ${failed.join(", ")}. ` +
        "Postgres rows NOT deleted. Fix issues and retry deprovision.",
    );
  }

  await db.delete(tenantProvisionEvents).where(eq(tenantProvisionEvents.tenantId, tenantId));
  await db.delete(adminAuditLog).where(eq(adminAuditLog.targetTenantId, tenantId));
  await db.delete(tenantDeployments).where(eq(tenantDeployments.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  cleanupResults.postgresRows = true;

  try {
    await rm(join(defaultTenantEnvRoot(), row.slug), { recursive: true, force: true });
    cleanupResults.envDir = true;
  } catch {
    log(`[deprovision] could not remove tenant env dir for ${row.slug}`);
  }

  log(`deprovision done for ${project}`);
  return { ok: true, slug: row.slug, composeProject: project, docker: dockerStatus };
}