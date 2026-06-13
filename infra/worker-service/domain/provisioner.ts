import { statSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { createConnection } from "node:net";

import {
  adminAuditLog,
  tenantDeployments,
  tenantLifecycleJobs,
  tenantProvisionEvents,
  tenants,
  tenantDeletionLogs,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import { execa } from "execa";
import type { RowDataPacket } from "mysql2";

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
  return process.env.SHARED_MYSQL_HOST ?? "stockix-mysql";
}

// REPAIRED: worker host override for host-run worker 2026-06-05
/** Host-run worker reaches shared MySQL via published localhost ports in dev. */
function workerSharedMysqlHost(): string {
  return process.env.WORKER_SHARED_MYSQL_HOST?.trim() || sharedMysqlHost();
}

function sharedMysqlRootPassword(): string {
  return process.env.SHARED_MYSQL_ROOT_PASSWORD ?? "";
}

function sharedMongoHost(): string {
  return process.env.SHARED_MONGO_HOST ?? "stockix-mongo";
}

function workerProxySqlAdminHost(): string {
  if (process.env.WORKER_SHARED_MYSQL_HOST?.trim() === "127.0.0.1") {
    return "127.0.0.1";
  }
  return process.env.MYSQL_PROXY_HOST ?? "stockix-mysql-proxy";
}

function workerProxySqlTenantPort(): number {
  const raw = process.env.MYSQL_PROXY_PORT ?? "6033";
  const port = parseInt(String(raw), 10);
  return Number.isFinite(port) ? port : 6033;
}

function proxySqlAdminCredentials(): { user: string; password: string } {
  return {
    user: process.env.PROXYSQL_ADMIN_USER ?? "admin",
    password: process.env.PROXYSQL_ADMIN_PASSWORD ?? "admin",
  };
}

function escapeProxySqlLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

type ProxySqlAdminConnection = {
  query: (sql: string, values?: unknown[]) => Promise<unknown>;
};

async function applyProxySqlUserSync(
  conn: ProxySqlAdminConnection,
  username: string,
  password: string,
): Promise<void> {
  await conn.query("DELETE FROM mysql_users WHERE username = ?", [username]);
  await conn.query(
    "INSERT INTO mysql_users (username, password, default_hostgroup, active, max_connections) VALUES (?, ?, 0, 1, 200)",
    [username, password],
  );
  await conn.query("LOAD MYSQL USERS TO RUNTIME");
  await conn.query("SAVE MYSQL USERS TO DISK");
}

async function applyProxySqlUserSyncViaDockerExec(
  username: string,
  password: string,
  log: (m: string) => void,
): Promise<void> {
  const repoRoot = getRepoRoot();
  const sharedComposeFile = join(repoRoot, "infra", "shared", "docker-compose.yml");
  const container = await getComposeContainerName(
    "stockix-shared",
    sharedComposeFile,
    "stockix-mysql-proxy",
  );
  if (!container) {
    throw new Error("[db-provision] ProxySQL container not found for admin sync fallback");
  }

  const { user: adminUser, password: adminPassword } = proxySqlAdminCredentials();
  const safeUser = escapeProxySqlLiteral(username);
  const safePassword = escapeProxySqlLiteral(password);
  const sql = [
    `DELETE FROM mysql_users WHERE username='${safeUser}';`,
    `INSERT INTO mysql_users (username, password, default_hostgroup, active, max_connections) VALUES ('${safeUser}', '${safePassword}', 0, 1, 200);`,
    "LOAD MYSQL USERS TO RUNTIME;",
    "SAVE MYSQL USERS TO DISK;",
  ].join(" ");

  await execa(
    "docker",
    [
      "exec",
      container,
      "mysql",
      "-h127.0.0.1",
      "-P6032",
      `-u${adminUser}`,
      `-p${adminPassword}`,
      "-e",
      sql,
    ],
    { stdio: "pipe" },
  );
  log(`[db-provision] ProxySQL user registered via docker exec: ${username}`);
}

async function verifyProxySqlTenantLogin(
  username: string,
  password: string,
  log: (m: string) => void,
): Promise<void> {
  const host = workerProxySqlAdminHost();
  const port = workerProxySqlTenantPort();
  const mysql2 = await import("mysql2/promise");
  const conn = await mysql2.createConnection({
    host,
    port,
    user: username,
    password,
    connectTimeout: 10_000,
  });
  try {
    await conn.query("SELECT 1");
    log(`[db-provision] ProxySQL tenant login verified: ${username}@${host}:${port}`);
  } finally {
    await conn.end();
  }
}

async function registerMysqlUserInProxySql(
  username: string,
  password: string,
  log: (m: string) => void,
): Promise<void> {
  const proxyHost = workerProxySqlAdminHost();
  const { user: adminUser, password: adminPassword } = proxySqlAdminCredentials();
  let synced = false;
  let directError: unknown;

  try {
    const mysql2 = await import("mysql2/promise");
    const conn = await mysql2.createConnection({
      host: proxyHost,
      port: 6032,
      user: adminUser,
      password: adminPassword,
      connectTimeout: 10_000,
    });
    try {
      await applyProxySqlUserSync(conn, username, password);
      log(`[db-provision] ProxySQL user registered: ${username}`);
      synced = true;
    } finally {
      await conn.end();
    }
  } catch (err) {
    directError = err;
    log(
      `[db-provision] ProxySQL admin connect failed (${proxyHost}:6032), trying docker exec fallback…`,
    );
  }

  if (!synced) {
    try {
      await applyProxySqlUserSyncViaDockerExec(username, password, log);
      synced = true;
    } catch (execErr) {
      const directMsg =
        directError instanceof Error ? directError.message : String(directError ?? "unknown");
      const execMsg = execErr instanceof Error ? execErr.message : String(execErr);
      throw new Error(
        `[db-provision] ProxySQL user sync failed for ${username} (direct: ${directMsg}; docker exec: ${execMsg})`,
      );
    }
  }

  try {
    await verifyProxySqlTenantLogin(username, password, log);
  } catch (err) {
    throw new Error(
      `[db-provision] ProxySQL user sync post-verify failed for ${username}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// REPAIRED: worker host override for host-run worker 2026-06-05
/** Host-run worker reaches shared Mongo via published localhost ports in dev. */
function workerSharedMongoHost(): string {
  return process.env.WORKER_SHARED_MONGO_HOST?.trim() || sharedMongoHost();
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
    const id = stdout.trim().split("\n")
      .map((line) => line.trim())
      .find((line) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{11,63}$/.test(line));
    if (!id) return null;
    const { stdout: nameOut } = await execa(
      "docker",
      ["inspect", "-f", "{{.Name}}", id],
      { stdio: "pipe" },
    );
    const name = nameOut.trim().replace(/^\//, "");
    return name || null;
  } catch (err) {
    console.error("[getComposeContainerName-debug] Error resolving container name:", err);
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
    return true;
  }

  const patterns = [`tenant:${slug}:*`, `bull:tenant:${slug}:*`];
  const redisPassword = process.env.TENANT_REDIS_PASSWORD?.trim();
  const redisCliArgs = ["exec", redisContainer, "redis-cli"];
  if (redisPassword && redisPassword !== "__MUST_OVERRIDE__") {
    redisCliArgs.push("-a", redisPassword);
  }
  try {
    let total = 0;
    for (const pattern of patterns) {
      const { stdout } = await execa(
        "docker",
        [
          ...redisCliArgs,
          "EVAL",
          "local c='0'; local n=0; repeat local r=redis.call('SCAN',c,'MATCH',ARGV[1],'COUNT',100); c=r[1]; for _,k in ipairs(r[2]) do redis.call('DEL',k); n=n+1 end until c=='0'; return n",
          "0",
          pattern,
        ],
        { stdio: "pipe" },
      );
      const count = Number.parseInt(stdout.trim(), 10);
      if (Number.isFinite(count)) total += count;
      log(`[db-deprovision] flushed ${Number.isFinite(count) ? count : 0} Redis keys matching ${pattern}`);
    }
    return true;
  } catch (err) {
    log(
      `[db-deprovision] Redis flush warning: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/** MySQL usernames are limited to 32 characters (including the `tenant_` prefix). */
export const MYSQL_USERNAME_MAX_LEN = 32;
const TENANT_MYSQL_USER_PREFIX = "tenant_";
const TENANT_MYSQL_USER_SAFE_MAX = MYSQL_USERNAME_MAX_LEN - TENANT_MYSQL_USER_PREFIX.length;

/**
 * Sanitize a tenant slug for use as a MySQL identifier segment.
 * Database names may use up to 28 chars; usernames use {@link tenantMysqlUsername}.
 */
export function slugToMysqlSafe(slug: string, maxLen = 28): string {
  return slug.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, maxLen);
}

/** Per-tenant MySQL user — max 32 chars (`tenant_` + up to 25 safe slug chars). */
export function tenantMysqlUsername(slug: string): string {
  const safe = slugToMysqlSafe(slug, TENANT_MYSQL_USER_SAFE_MAX);
  return `${TENANT_MYSQL_USER_PREFIX}${safe}`;
}

/** MySQL identifiers for a tenant slug (legacy `_finance` + `_system` + scoped user). */
export function tenantMysqlDatabaseNames(slug: string): {
  financeDb: string;
  systemDb: string;
  tenantUser: string;
  orgDbPattern: string;
  dbPrefix: string;
} {
  const safe = slugToMysqlSafe(slug);
  const dbPrefix = `stockix_${safe}_`;
  return {
    financeDb: `${dbPrefix}finance`,
    systemDb: `${dbPrefix}system`,
    tenantUser: tenantMysqlUsername(slug),
    orgDbPattern: `${dbPrefix}%`,
    dbPrefix,
  };
}

/** Escape `_` / `%` for MySQL LIKE (slug underscores are not wildcards). */
export function mysqlLikePatternEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/_/g, "\\_").replace(/%/g, "\\%");
}

/**
 * Provision tenant databases on shared infrastructure.
 * Called BEFORE docker compose up.
 *
 * MySQL  → CREATE DATABASE + CREATE USER + GRANT (via mysql2, already in api deps).
 * MongoDB → database auto-created by Finance on first write.
 *           We verify stockix-mongo is reachable via TCP ping only.
 */
export async function provisionTenantDatabases(
  slug: string,
  dbPassword: string,
  log: (m: string) => void,
): Promise<void> {
  const { financeDb, systemDb, tenantUser, orgDbPattern } = tenantMysqlDatabaseNames(slug);
  const mysqlHost  = workerSharedMysqlHost();
  const rootPassword = sharedMysqlRootPassword();

  if (!rootPassword) {
    throw new Error(
      "[db-provision] SHARED_MYSQL_ROOT_PASSWORD is not set — cannot provision tenant databases",
    );
  }

  await assertWorkerCanReachSharedMysql(log);

  log(`[db-provision] creating MySQL databases for tenant "${slug}"`);

  // mysql2 is in apps/api/package.json — available via tsup bundling
  const mysql2 = await import("mysql2/promise");
  const { escape: mysqlEscape } = await import("mysql2");
  const conn = await mysql2.createConnection({
    host: mysqlHost,
    port: 3306,
    user: "root",
    password: rootPassword,
    connectTimeout: 15_000,
  });

  try {
    // LEGACY COMPAT: stockix_{safe}_finance is created for upstream BigCapital compatibility.
    // It is intentionally included in deprovisionTenantDatabases() cleanup below.
    // Do not remove the creation without also removing the deprovision cleanup.
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${financeDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${systemDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    // IDENTIFIED BY does not accept prepared-statement placeholders on MySQL 8.
    await conn.execute(
      `CREATE USER IF NOT EXISTS '${tenantUser}'@'%' IDENTIFIED BY ${mysqlEscape(dbPassword)}`,
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
      `GRANT ALL PRIVILEGES ON \`${orgDbPattern}\`.* TO '${tenantUser}'@'%'`,
    );
    await conn.execute("FLUSH PRIVILEGES");
    log(`[db-provision] MySQL ready: ${financeDb}, ${systemDb}, user: ${tenantUser}`);
    await registerMysqlUserInProxySql(tenantUser, dbPassword, log);
  } finally {
    await conn.end();
  }

  // Verify MongoDB reachable via TCP, then ensure rs0 PRIMARY for POS replicaSet URIs.
  log(`[db-provision] verifying stockix-mongo reachability for tenant "${slug}"`);
  await verifyTcpReachable(workerSharedMongoHost(), 27017, "stockix-mongo");
  await ensureSharedMongoReplicaSetReady(log);
  log(`[db-provision] stockix-mongo ready (rs0 PRIMARY) — ${slug}_pos will be auto-created on first write`);
}

/**
 * Drop and recreate the tenant system DB before migrations.
 * Ensures a clean knex state when a prior migration attempt left partial tables.
 */
export async function resetSystemDatabaseForMigration(
  slug: string,
  dbPassword: string,
  log: (m: string) => void,
): Promise<void> {
  const safe = slugToMysqlSafe(slug);
  const systemDb = `stockix_${safe}_system`;
  const tenantUser = tenantMysqlUsername(slug);
  const mysqlHost = workerSharedMysqlHost();
  const rootPassword = sharedMysqlRootPassword();

  if (!rootPassword) {
    throw new Error(
      "[db-provision] SHARED_MYSQL_ROOT_PASSWORD is not set — cannot reset system database",
    );
  }

  const mysql2 = await import("mysql2/promise");
  const { escape: mysqlEscape } = await import("mysql2");
  const conn = await mysql2.createConnection({
    host: mysqlHost,
    port: 3306,
    user: "root",
    password: rootPassword,
    connectTimeout: 15_000,
  });

  try {
    log(`[db-provision] resetting system database ${systemDb} for migration`);
    await conn.execute(`DROP DATABASE IF EXISTS \`${systemDb}\``);
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${systemDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.execute(
      `CREATE USER IF NOT EXISTS '${tenantUser}'@'%' IDENTIFIED BY ${mysqlEscape(dbPassword)}`,
    );
    await conn.execute(
      `GRANT ALL PRIVILEGES ON \`${systemDb}\`.* TO '${tenantUser}'@'%'`,
    );
    await conn.execute("FLUSH PRIVILEGES");
    log(`[db-provision] system database ${systemDb} ready for migration`);
  } finally {
    await conn.end();
  }
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
  const { financeDb, systemDb, tenantUser, dbPrefix } = tenantMysqlDatabaseNames(slug);
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
        `DROP matching ${dbPrefix}* and revoke ${tenantUser}`,
    );
  }

  log(`[db-deprovision] dropping MySQL databases for tenant "${slug}"`);
  try {
    const mysql2 = await import("mysql2/promise");
    const conn = await mysql2.createConnection({
      host: workerSharedMysqlHost(),
      port: 3306,
      user: "root",
      password: rootPassword,
      connectTimeout: 15_000,
    });
    try {
      await conn.execute(`DROP DATABASE IF EXISTS \`${financeDb}\``);
      await conn.execute(`DROP DATABASE IF EXISTS \`${systemDb}\``);

      const [orgRows] = await conn.query<RowDataPacket[]>(
        `SELECT schema_name AS schemaName FROM information_schema.schemata WHERE schema_name LIKE 'stockix%'`,
      );
      for (const row of orgRows) {
        const dbName = row.schemaName as string;
        if (!dbName?.startsWith(dbPrefix)) continue;
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
      result.mongoDb = true;
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

function isWorkerRunningInContainer(): boolean {
  return Boolean(process.env.DOCKER_HOST?.trim());
}

/** Fail fast when host-run worker cannot reach shared MySQL before opening mysql2 connection. */
async function assertWorkerCanReachSharedMysql(log: (m: string) => void): Promise<void> {
  const mysqlHost = workerSharedMysqlHost();
  const onHost = !isWorkerRunningInContainer();
  const isProduction = process.env.NODE_ENV === "production";

  if (onHost && !process.env.WORKER_SHARED_MYSQL_HOST?.trim()) {
    if (isProduction) {
      throw new Error(
        "[db-provision] WORKER_SHARED_MYSQL_HOST must be set when worker runs on host in production",
      );
    }
    log(
      "[db-provision][warn] WORKER_SHARED_MYSQL_HOST unset — probing SHARED_MYSQL_HOST (set 127.0.0.1 when worker runs on host)",
    );
  }

  await verifyTcpReachable(mysqlHost, 3306, "shared MySQL");
}

async function resolveSharedInfraEnvFile(): Promise<string | undefined> {
  const rootEnv = join(getRepoRoot(), ".env");
  try {
    await stat(rootEnv);
    return rootEnv;
  } catch {
    const prodEnv = join(getRepoRoot(), "infra", "prod", ".env");
    try {
      await stat(prodEnv);
      return prodEnv;
    } catch {
      return undefined;
    }
  }
}

function sharedInfraComposeArgs(envFile: string | undefined): string[] {
  const repoRoot = getRepoRoot();
  const sharedComposeFile = join(repoRoot, "infra", "shared", "docker-compose.yml");
  const devPortsFile = join(repoRoot, "infra", "shared", "docker-compose.dev-ports.yml");
  const args = ["compose", "-f", sharedComposeFile];
  try {
    if (statSync(devPortsFile).isFile()) {
      args.push("-f", devPortsFile);
    }
  } catch {
    /* dev-ports overlay optional outside local dev */
  }
  args.push("-p", "stockix-shared");
  if (envFile) args.push("--env-file", envFile);
  return args;
}

/**
 * Idempotent rs0 bootstrap via shared compose (same as infra/prod OPERATIONS.md).
 * Blocks until PRIMARY or throws — required before POS stacks using ?replicaSet=rs0.
 */
export async function ensureSharedMongoReplicaSetReady(log: (m: string) => void): Promise<void> {
  const envFile = await resolveSharedInfraEnvFile();
  log("[db-provision] ensuring shared Mongo replica set rs0 is PRIMARY");
  const args = [
    ...sharedInfraComposeArgs(envFile),
    "run",
    "--rm",
    "stockix-mongo-rs-init",
  ];
  const result = await execa("docker", args, {
    stdio: "pipe",
    env: process.env,
    reject: false,
  });
  if (result.exitCode !== 0) {
    const detail = [result.stderr, result.stdout]
      .map((chunk) => chunk?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .slice(0, 500);
    throw new Error(
      `[db-provision] mongo rs0 not ready: stockix-mongo-rs-init exited ${result.exitCode}${detail ? `: ${detail}` : ""}`,
    );
  }
  log("[db-provision] shared Mongo replica set rs0 is PRIMARY");
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

async function financeStackContainersRunning(project: string): Promise<boolean> {
  try {
    const { stdout } = await execa(
      "docker",
      ["ps", "--filter", `name=${project}`, "--format", "{{.Names}}"],
      { stdio: "pipe" },
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/** Fail deprovision when finance compose down did not stop all project containers. */
export async function assertFinanceStackStopped(project: string): Promise<void> {
  if (await financeStackContainersRunning(project)) {
    throw new Error(
      `[deprovision] Finance stack ${project} still has running containers after compose down`,
    );
  }
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

  const { orgDbPattern, tenantUser } = tenantMysqlDatabaseNames(row.slug);
  const rootPassword = sharedMysqlRootPassword();
  // CRITICAL: Never delete Postgres tenant rows until data plane
  // cleanup succeeds. Orphaned shared DB data is a security risk.
  if (!rootPassword) {
    throw new Error(
      "[deprovision] SHARED_MYSQL_ROOT_PASSWORD is not set. " +
        "Cannot safely remove tenant MySQL databases. " +
        "Deprovision aborted — Postgres rows NOT deleted. " +
        "Set the password and retry, or manually drop: " +
        `DROP matching ${orgDbPattern} and revoke ${tenantUser}`,
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
    const financeRunning = await financeStackContainersRunning(project);
    if (!financeRunning) {
      log(
        JSON.stringify({
          event: "deprovision_finance_already_stopped",
          project,
          slug: row.slug,
        }),
      );
      dockerStatus = "skipped";
      cleanupResults.financeCompose = true;
    } else {
      await stat(envPath);
      const downArgs = ["down", "--remove-orphans", "--timeout", "30"];
      if (options.removeVolumes) downArgs.push("-v");
      if (options.removeImages) downArgs.push("--rmi", "local");
      await dockerRunner.run(composeFile, project, envPath, composeEnv, downArgs, {
        timeoutMs: 2 * 60 * 1000,
      });
      await assertFinanceStackStopped(project);
      dockerStatus = "stopped";
      cleanupResults.financeCompose = true;
    }

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
        JSON.stringify({
          level: "warn",
          event: "deprovision_pos_compose_down_failed",
          project: posProject,
          slug: row.slug,
          message: err instanceof Error ? err.message : String(err),
        }),
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
        JSON.stringify({
          level: "warn",
          event: "deprovision_pms_compose_down_failed",
          project: pmsProject,
          slug: row.slug,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  } catch (err) {
    throw err instanceof Error
      ? err
      : new Error(`[deprovision] finance compose down failed: ${String(err)}`);
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
    cleanupResults.financeCompose &&
    cleanupResults.mysqlDbs &&
    cleanupResults.mongoDb &&
    cleanupResults.redisKeys;
  if (!dataPlaneClean) {
    const failed = Object.entries(cleanupResults)
      .filter(
        ([key, ok]) =>
          !ok && ["financeCompose", "mysqlDbs", "mongoDb", "redisKeys"].includes(key),
      )
      .map(([key]) => key);

    await db.insert(tenantDeletionLogs).values({
      tenantId,
      slug: row.slug,
      status: "partial_failure",
      message: `Data plane cleanup incomplete: ${failed.join(", ")}`,
      meta: {
        composeProject: project,
        removeVolumes: options.removeVolumes,
        removeImages: options.removeImages,
        cleanupResults,
      },
    }).catch((err) => {
      log(`[deprovision] failed to insert tenantDeletionLogs for ${row.slug}: ${err instanceof Error ? err.message : String(err)}`);
    });
    throw new Error(
      `[deprovision] Data plane cleanup incomplete: ${failed.join(", ")}. ` +
        "Postgres rows NOT deleted. Fix issues and retry deprovision.",
    );
  }

  try {
    await rm(join(defaultTenantEnvRoot(), row.slug), { recursive: true, force: true });
    cleanupResults.envDir = true;
  } catch {
    log(`[deprovision] could not remove tenant env dir for ${row.slug}`);
  }

  if (options.lifecycleJobId) {
    await db
      .update(tenantLifecycleJobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        lastError: null,
        claimedAt: null,
        claimedBy: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantLifecycleJobs.id, options.lifecycleJobId),
          eq(tenantLifecycleJobs.status, "running"),
        ),
      );
  }

  await db.delete(tenantProvisionEvents).where(eq(tenantProvisionEvents.tenantId, tenantId));
  await db.delete(adminAuditLog).where(eq(adminAuditLog.targetTenantId, tenantId));
  await db.delete(tenantDeployments).where(eq(tenantDeployments.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  
  await db.insert(tenantDeletionLogs).values({
    tenantId,
    slug: row.slug,
    status: "success",
    message: "Tenant deprovisioned successfully",
    meta: {
      composeProject: project,
      removeVolumes: options.removeVolumes,
      removeImages: options.removeImages,
      cleanupResults,
    },
  }).catch((err) => {
    log(`[deprovision] failed to insert tenantDeletionLogs for ${row.slug}: ${err instanceof Error ? err.message : String(err)}`);
  });

  cleanupResults.postgresRows = true;

  log(`deprovision done for ${project}`);
  return { ok: true, slug: row.slug, composeProject: project, docker: dockerStatus };
}

export { escapeProxySqlLiteral, registerMysqlUserInProxySql };