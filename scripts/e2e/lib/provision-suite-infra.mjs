/**
 * Docker/infra checks, Finance/POS probes, teardown, and SQL helpers for E2E suite.
 */

import { execSync } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execa } from "execa";
import {
  SuiteError,
  assertEqual,
  assertTruthy,
  readJson,
  sleep,
  tenantMysqlNames,
  mysqlLikePatternEscape,
} from "./provision-suite-core.mjs";

export const MYSQL_CONTAINER =
  process.env.HEALTH_MYSQL_CONTAINER ?? "stockix-shared-stockix-mysql-1";
export const MONGO_CONTAINER =
  process.env.HEALTH_MONGO_CONTAINER ?? "stockix-shared-stockix-mongo-1";
export const REDIS_CONTAINER =
  process.env.HEALTH_REDIS_CONTAINER ?? "stockix-shared-stockix-redis-1";
export const MYSQL_ROOT = process.env.SHARED_MYSQL_ROOT_PASSWORD ?? "";
export const TRAEFIK_DIR = (process.env.TRAEFIK_DYNAMIC_DIR ?? "/opt/stockix/traefik-dynamic").replace(
  /\/+$/,
  "",
);
export const POS_API_KEY = (process.env.POS_PLATFORM_API_KEY ?? "").trim();

const E2E_REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SHARED_COMPOSE = join(E2E_REPO_ROOT, "infra", "shared", "docker-compose.yml");
const SHARED_COMPOSE_DEV_PORTS = join(E2E_REPO_ROOT, "infra", "shared", "docker-compose.dev-ports.yml");

function sharedDevPortsPublished() {
  const inspect = (service) => {
    try {
      return execSync(
        `docker inspect stockix-shared-${service}-1 --format "{{json .NetworkSettings.Ports}}"`,
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ).trim();
    } catch {
      return "";
    }
  };
  const mongoPorts = inspect("stockix-mongo");
  const proxyPorts = inspect("stockix-mysql-proxy");
  return {
    mongoOk: mongoPorts.includes("127.0.0.1") && mongoPorts.includes("27017"),
    proxyOk: proxyPorts.includes("127.0.0.1") && proxyPorts.includes("6032"),
  };
}

function reconcileSharedDevPorts() {
  if (!existsSync(SHARED_COMPOSE_DEV_PORTS)) return;
  const envFile = join(E2E_REPO_ROOT, ".env");
  const args = [
    "compose",
    "-f",
    SHARED_COMPOSE,
    "-f",
    SHARED_COMPOSE_DEV_PORTS,
    "--env-file",
    envFile,
    "up",
    "-d",
    "--wait",
    "stockix-mongo",
    "stockix-mysql-proxy",
  ];
  execSync(`docker ${args.map((a) => `"${a}"`).join(" ")}`, {
    cwd: E2E_REPO_ROOT,
    stdio: "inherit",
    shell: true,
  });
}

function runShell(cmd) {
  try {
    const out = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });
    return { ok: true, out: out.trim() };
  } catch (err) {
    return { ok: false, out: [err?.stdout, err?.stderr, err?.message].filter(Boolean).join("\n").trim() };
  }
}

export async function dockerProjectSnapshot(project) {
  try {
    const { stdout } = await execa("docker", [
      "ps",
      "-a",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--format",
      "{{.Names}}|{{.Status}}",
    ]);
    return stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((row) => {
        const [name = "", status = ""] = row.split("|");
        return { name, status };
      });
  } catch (error) {
    return [{ name: "(docker failed)", status: error instanceof Error ? error.message : String(error) }];
  }
}

export function dockerRunningHealthy(containers) {
  const running = containers.filter(
    (c) => c.status.toLowerCase().includes("up") && !c.status.toLowerCase().includes("exited"),
  );
  const healthy = running.filter((c) => /healthy/i.test(c.status) || !/unhealthy/i.test(c.status));
  return { running, healthy };
}

export async function dockerServicePort(project, service, containerPort) {
  try {
    const { stdout } = await execa("docker", ["compose", "-p", project, "port", service, String(containerPort)]);
    const match = stdout.trim().match(/:(\d+)\s*$/);
    return match?.[1] ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export async function verifyFinancePing(port) {
  for (let i = 0; i < 25; i += 1) {
    for (const path of ["/api/ping/", "/api/ping"]) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5_000) });
        if (res.ok) return { ok: true, status: res.status };
      } catch {
        /* retry */
      }
    }
    await sleep(2_000);
  }
  return { ok: false };
}

export async function financeSignIn(port, email, password) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: email, password }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new SuiteError(`Finance signin failed HTTP ${res.status}`, body);
  const accessToken = body.accessToken ?? body.access_token ?? body.token;
  assertTruthy(accessToken, "Finance accessToken");
  return {
    accessToken,
    organizationId: body.organizationId ?? body.organization_id,
    body,
  };
}

export async function financeSwitchTenant(port, accessToken, organizationId) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/switch-tenant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ organizationId }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new SuiteError(`switch-tenant failed HTTP ${res.status}`, body);
  const nextOrg = body.organizationId ?? body.organization_id ?? organizationId;
  assertEqual(String(nextOrg), String(organizationId), "switch-tenant organizationId");
  return { accessToken: body.accessToken ?? body.access_token ?? accessToken, organizationId: nextOrg, body };
}

export function listMysqlDatabases(slug) {
  if (!MYSQL_ROOT) return { ok: false, dbs: [], out: "SHARED_MYSQL_ROOT_PASSWORD unset" };
  const { dbPrefix, systemDb } = tenantMysqlNames(slug);
  const q = runShell(
    `docker exec ${MYSQL_CONTAINER} mysql -uroot -p"${MYSQL_ROOT.replace(/"/g, '\\"')}" -N -e "SHOW DATABASES LIKE 'stockix%';" 2>&1`,
  );
  const all = q.out
    .split("\n")
    .map((s) => s.trim())
    .filter((line) => line && !line.startsWith("mysql:") && !line.startsWith("ERROR"));
  const dbs = all.filter((db) => db.startsWith(dbPrefix));
  return { ok: q.ok && dbs.length > 0, dbs, systemDb, out: q.out };
}

export function mongoDbExists(slug) {
  const q = runShell(
    `docker exec ${MONGO_CONTAINER} mongosh --quiet --eval "db.getMongo().getDBNames().includes('${slug}_pos')" 2>&1`,
  );
  return q.ok && /true/i.test(q.out);
}

function redisCliExecArgs() {
  const args = ["exec", REDIS_CONTAINER, "redis-cli"];
  const pwd = process.env.TENANT_REDIS_PASSWORD?.trim();
  if (pwd && pwd !== "__MUST_OVERRIDE__") args.push("-a", pwd);
  return args;
}

function parseRedisScanOutput(out) {
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(
      (line) =>
        line
        && !line.startsWith("Warning:")
        && !line.includes("NOAUTH")
        && !line.startsWith("AUTH"),
    );
}

export function redisKeysForSlug(slug) {
  const q = runShell(`docker ${redisCliExecArgs().join(" ")} --scan --pattern "*${slug}*" 2>&1`);
  return parseRedisScanOutput(q.out);
}

export function bullmqQueueKeys(slug) {
  const q = runShell(
    `docker ${redisCliExecArgs().join(" ")} --scan --pattern "bull:tenant:${slug}:bigcapital_sync:*" 2>&1 | head -20`,
  );
  return parseRedisScanOutput(q.out);
}

export function traefikFileExists(slug, kind = "finance") {
  const file =
    kind === "pos" ? join(TRAEFIK_DIR, `tenant-pos-${slug}.yml`) : join(TRAEFIK_DIR, `tenant-${slug}.yml`);
  return existsSync(file) ? file : null;
}

export function readTraefikFile(slug, kind = "finance") {
  const path = traefikFileExists(slug, kind);
  return path ? readFileSync(path, "utf8") : null;
}

export async function verifyPosBackend(baseUrl) {
  for (const path of ["/health", "/ready"]) {
    try {
      const res = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) return { ok: true, path, status: res.status };
    } catch {
      /* retry */
    }
  }
  return { ok: false };
}

export async function verifyPosOrgApi(baseUrl, orgId) {
  const headers = { Accept: "application/json", "X-Forwarded-Proto": "https" };
  if (POS_API_KEY) headers["X-Api-Key"] = POS_API_KEY;
  const res = await fetch(`${baseUrl}/api/platform/v1/organizations/${orgId}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: res.ok, status: res.status, body: await readJson(res) };
}

export async function verifyPosWireHealth(baseUrl, orgId) {
  const headers = { Accept: "application/json", "X-Forwarded-Proto": "https" };
  if (POS_API_KEY) headers["X-Api-Key"] = POS_API_KEY;
  const res = await fetch(
    `${baseUrl}/api/platform/v1/organizations/${orgId}/integration/bigcapital/health`,
    { headers, signal: AbortSignal.timeout(15_000) },
  );
  return { ok: res.ok, status: res.status, body: await readJson(res) };
}

export async function posAdminLogin(baseUrl, pin) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: String(pin) }),
  });
  return { ok: res.ok, status: res.status, body: await readJson(res) };
}

export async function pollTenantDeleted(api, tenantId, maxMs = 10 * 60 * 1000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const res = await api("GET", `/tenants/${tenantId}`);
    if (res.status === 404) return { ok: true };
    await sleep(5000);
  }
  return { ok: false };
}

export async function deprovisionTenant(api, tenantId) {
  const res = await api("DELETE", `/tenants/${tenantId}?volumes=true`);
  if (res.status !== 200 && res.status !== 202) {
    throw new SuiteError(`DELETE /tenants/${tenantId} → HTTP ${res.status}`, res.data);
  }
  return pollTenantDeleted(api, tenantId);
}

export async function assertTeardownClean(slug, maxMs = 120_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const mysql = listMysqlDatabases(slug);
    const mongo = mongoDbExists(slug);
    const redis = redisKeysForSlug(slug);
    const traefik = traefikFileExists(slug, "finance") || traefikFileExists(slug, "pos");
    if (!mysql.dbs.length && !mongo && !redis.length && !traefik) return;
    await sleep(5000);
  }
  const mysql = listMysqlDatabases(slug);
  if (mysql.dbs.length) throw new SuiteError(`MySQL databases still present after deprovision`, { slug, dbs: mysql.dbs });
  if (mongoDbExists(slug)) throw new SuiteError(`MongoDB ${slug}_pos still exists`, { slug });
  const redis = redisKeysForSlug(slug);
  if (redis.length) throw new SuiteError(`Redis keys still present`, { slug, redis: redis.slice(0, 10) });
  if (traefikFileExists(slug, "finance") || traefikFileExists(slug, "pos")) {
    throw new SuiteError(`Traefik YAML still present`, { slug });
  }
}

export async function assertOrgSlugUniqueConstraint(tenantId, duplicateSlug) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new SuiteError("DATABASE_URL required for org slug constraint test");
  const sql = (await import("postgres")).default;
  const pg = sql(dbUrl, { max: 1 });
  try {
    await pg`
      INSERT INTO organizations (id, tenant_id, name, slug, subdomain, status, is_primary, created_at, updated_at)
      VALUES (${randomUUID()}, ${tenantId}, 'dup-test', ${duplicateSlug}, ${duplicateSlug + ".test"}, 'provisioning', false, NOW(), NOW())
    `;
    throw new SuiteError("Expected duplicate org slug insert to fail");
  } catch (err) {
    if (err instanceof SuiteError) throw err;
    if ((err?.code ?? err?.cause?.code) !== "23505") {
      throw new SuiteError(`Expected unique violation 23505`, { err: String(err) });
    }
  } finally {
    await pg.end({ timeout: 5 });
  }
}

export async function assertOrgSlugAllowedAcrossTenants(_tenantIdA, tenantIdB, sharedSlug) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new SuiteError("DATABASE_URL required for cross-tenant org slug test");
  const sql = (await import("postgres")).default;
  const pg = sql(dbUrl, { max: 1 });
  const newId = randomUUID();
  try {
    await pg`
      INSERT INTO organizations (id, tenant_id, name, slug, subdomain, status, is_primary, created_at, updated_at)
      VALUES (${newId}, ${tenantIdB}, 'cross-tenant slug ok', ${sharedSlug}, ${sharedSlug + ".x"}, 'provisioning', false, NOW(), NOW())
    `;
  } finally {
    await pg`DELETE FROM organizations WHERE id = ${newId}`.catch(() => undefined);
    await pg.end({ timeout: 5 });
  }
}

export async function setOwnerPasswordForE2e(email, password, role) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new SuiteError("DATABASE_URL required to set test owner password");
  const bcrypt = (await import("bcryptjs")).default;
  const hash = await bcrypt.hash(password, 12);
  const sql = (await import("postgres")).default;
  const pg = sql(dbUrl, { max: 1 });
  try {
    const rows = role
      ? await pg`
          UPDATE owners SET password_hash = ${hash}, status = 'active', role = ${role}
          WHERE email = ${email} RETURNING id
        `
      : await pg`
          UPDATE owners SET password_hash = ${hash}, status = 'active'
          WHERE email = ${email} RETURNING id
        `;
    if (!rows.length) throw new SuiteError(`Owner not found for email ${email}`);
  } finally {
    await pg.end({ timeout: 5 });
  }
}

/** @param {string} host @param {number} port @param {number} timeoutMs */
function probeHostTcp(host, port, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(undefined);
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** TCP probe for host-run worker shared infra (requires docker-compose.dev-ports.yml). */
export async function assertHostInfraReachable() {
  if (existsSync(SHARED_COMPOSE_DEV_PORTS)) {
    let ports = sharedDevPortsPublished();
    if (!ports.mongoOk || !ports.proxyOk) {
      console.warn("[e2e] Shared dev ports missing — re-applying dev-ports overlay…");
      reconcileSharedDevPorts();
      ports = sharedDevPortsPublished();
      if (!ports.mongoOk || !ports.proxyOk) {
        throw new SuiteError(
          "Shared dev ports still missing after reconcile (127.0.0.1:27017, 127.0.0.1:6032).",
        );
      }
    }
  }

  const mongoHost = process.env.WORKER_SHARED_MONGO_HOST ?? "127.0.0.1";
  const mysqlHost = process.env.WORKER_SHARED_MYSQL_HOST ?? "127.0.0.1";
  const checks = [
    { host: mongoHost, port: 27017, label: "Mongo (stockix-mongo)" },
    { host: mysqlHost, port: 3306, label: "MySQL (stockix-mysql)" },
    { host: mysqlHost, port: 6032, label: "ProxySQL admin" },
  ];
  for (const { host, port, label } of checks) {
    try {
      await probeHostTcp(host, port);
    } catch (err) {
      throw new SuiteError(
        `${label} not reachable at ${host}:${port} from the host. ` +
          "Run shared infra with dev-ports: " +
          "docker compose -f infra/shared/docker-compose.yml -f infra/shared/docker-compose.dev-ports.yml --env-file .env up -d --wait",
        { cause: err instanceof Error ? err.message : String(err) },
      );
    }
  }
}
