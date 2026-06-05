#!/usr/bin/env node
/**
 * Stockix platform end-to-end audit runner.
 *
 * Usage:
 *   node --env-file=.env scripts/e2e-audit.mjs
 *   pnpm audit:e2e
 *
 * Requires local stack: API on STOCKIX_API_URL (default http://localhost:4000),
 * worker running, shared infra on stockix-shared network.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ────────────────────────────────────────────────
const API = (process.env.STOCKIX_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? "";
const ADMIN_PASS = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
const OWNER_ID_ENV = process.env.OWNER_ID ?? process.env.SMOKE_OWNER_ID ?? "";
const TEST_SLUG_BASE = `e2e-${Date.now()}`;
const PROVISION_TIMEOUT_MS = Number(process.env.PROVISION_MAX_MS ?? 15 * 60 * 1000);
const PROVISION_POLL_MS = Number(process.env.PROVISION_POLL_MS ?? 3000);
const FULL_PROVISION_TIMEOUT_MS = Number(process.env.E2E_FULL_PROVISION_MAX_MS ?? 20 * 60 * 1000);
const REPO_ROOT = resolve(__dirname, "..");
const REPORT_PATH = resolve(REPO_ROOT, "docs/testingresult2.md");

const MYSQL_CONTAINER =
  process.env.HEALTH_MYSQL_CONTAINER ?? process.env.BACKUP_MYSQL_CONTAINER ?? "stockix-shared-stockix-mysql-1";
const MONGO_CONTAINER =
  process.env.HEALTH_MONGO_CONTAINER ?? process.env.BACKUP_MONGO_CONTAINER ?? "stockix-shared-stockix-mongo-1";
const REDIS_CONTAINER =
  process.env.HEALTH_REDIS_CONTAINER ?? "stockix-shared-stockix-redis-1";
const MYSQL_ROOT = process.env.SHARED_MYSQL_ROOT_PASSWORD ?? process.env.MYSQL_ROOT_PASSWORD ?? "";

/** @type {Array<{ id: string, title: string, status: string, detail: string, durationMs: number, evidence?: string, issue?: string }>} */
const results = [];
/** @type {{ cookie: string | null, ownerId: string | null, skipAuth: boolean, skipAll: boolean, tenants: Array<{ id: string, slug: string }>, acct: Record<string, unknown>, pos: Record<string, unknown>, full: Record<string, unknown>, licenseId: string | null, revokeLicenseId: string | null, supportOwnerId: string | null, secondOrgId: string | null, planId: string | null, sharedInfra: Record<string, { status: string, evidence: string }>, backupScripts: Array<{ script: string, exists: boolean, syntaxOk: boolean, notes: string }>, tenantIsolation: Array<Record<string, string>> }} */
const ctx = {
  cookie: null,
  ownerId: OWNER_ID_ENV || null,
  skipAuth: false,
  skipAll: false,
  tenants: [],
  acct: {},
  pos: {},
  full: {},
  licenseId: null,
  revokeLicenseId: null,
  supportOwnerId: null,
  secondOrgId: null,
  planId: null,
  sharedInfra: {},
  backupScripts: [],
  tenantIsolation: [],
};

// ─── Helpers ───────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function truncate(value, max = 1200) {
  const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function log(emoji, label, detail = "") {
  const line = detail ? `${emoji} ${label}: ${detail}` : `${emoji} ${label}`;
  console.log(line);
}

function record(id, title, status, detail, durationMs, evidence, issue) {
  results.push({ id, title, status, detail, durationMs, evidence, issue });
  const icon =
    status === "PASS" ? "✅" : status === "FAIL" ? "❌" : status === "PARTIAL" ? "⚠️" : "⏭️";
  log(icon, `${id} — ${title}`, `${status} (${durationMs}ms) — ${detail}`);
}

/** Unauthenticated fetch for public endpoints (/health, /ready). */
async function publicApi(method, path) {
  const headers = { Accept: "application/json" };
  const url = path.startsWith("http") ? path : `${API}${path.startsWith("/") ? "" : "/"}${path}`;
  try {
    const res = await fetch(url, { method, headers, signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { _raw: text };
    }
    return { ok: res.ok, status: res.status, data, headers: res.headers };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

async function api(method, path, body, token) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const routePath = (path.startsWith("http") ? new URL(path).pathname : path).split("?")[0];
  const upperMethod = method.toUpperCase();
  if (
    ["POST", "PATCH", "DELETE"].includes(upperMethod) &&
    (routePath.startsWith("/tenants") || routePath.startsWith("/owners"))
  ) {
    headers["Idempotency-Key"] = randomUUID();
  }
  const auth = token ?? ctx.cookie;
  if (auth) {
    if (auth.startsWith("stockix-session=")) headers.Cookie = auth;
    else headers.Cookie = auth;
  }
  if (process.env.PROVISION_AUTH_BEARER) {
    headers.Authorization = `Bearer ${process.env.PROVISION_AUTH_BEARER}`;
  } else if (process.env.NODE_ENV !== "production") {
    headers.Authorization = "Bearer local-dev";
  }
  const url = path.startsWith("http") ? path : `${API}${path.startsWith("/") ? "" : "/"}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { error: err instanceof Error ? err.message : String(err) },
    };
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

async function rawFetch(url, options = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), ...options });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { _raw: text };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err instanceof Error ? err.message : String(err) } };
  }
}

async function waitForProvision(correlationId, token, maxMs = PROVISION_TIMEOUT_MS) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const res = await api("GET", `/tenants/provision-status/${correlationId}`, undefined, token);
    if (res.status === 404) {
      return { ok: false, status: "not_found", data: res.data };
    }
    const st = res.data?.status;
    if (st === "failed") {
      return { ok: false, status: "failed", data: res.data };
    }
    if (st === "complete") {
      return { ok: true, status: "complete", data: res.data };
    }
    await sleep(PROVISION_POLL_MS);
  }
  return { ok: false, status: "timeout", data: { correlationId, maxMs } };
}

async function pollTenantStatus(tenantId, predicate, maxMs = 5 * 60 * 1000, intervalMs = 3000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const res = await api("GET", `/tenants/${tenantId}`);
    const status = res.data?.tenant?.status;
    if (res.ok && predicate(status, res.data)) {
      return { ok: true, status, data: res.data };
    }
    await sleep(intervalMs);
  }
  return { ok: false, status: "timeout", data: null };
}

async function pollJobStatus(tenantId, maxMs = 5 * 60 * 1000) {
  const res = await pollTenantStatus(
    tenantId,
    (s) => s === "active" || s === "partial" || s === "failed",
    maxMs,
  );
  return res.status ?? "timeout";
}

async function pollTenantDeleted(tenantId, maxMs = 10 * 60 * 1000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const res = await api("GET", `/tenants/${tenantId}`, undefined, ctx.cookie);
    if (res.status === 404) return { ok: true };
    await sleep(5000);
  }
  return { ok: false };
}

async function resolveOwnerId() {
  if (ctx.ownerId) return ctx.ownerId;
  const res = await api("GET", "/owners", undefined, ctx.cookie);
  const owners = res.data?.owners ?? [];
  if (!res.ok || owners.length === 0) {
    throw new Error(`Could not resolve owner_id (GET /owners → ${res.status})`);
  }
  ctx.ownerId = owners[0].id;
  return ctx.ownerId;
}

async function provisionTenant(slugSuffix, name, adminEmail, modules, maxMs) {
  const ownerId = await resolveOwnerId();
  const slug = `${TEST_SLUG_BASE}-${slugSuffix}`;
  const body = {
    slug,
    name,
    owner_id: ownerId,
    admin_email: adminEmail,
    admin_first_name: "E2E",
    admin_last_name: slugSuffix.toUpperCase(),
    plan_slug: "starter",
    modules,
  };
  const create = await api("POST", "/tenants", body, ctx.cookie);
  if (create.status !== 202 || !create.data?.correlationId) {
    throw new Error(`POST /tenants failed: HTTP ${create.status} ${truncate(create.data, 300)}`);
  }
  const poll = await waitForProvision(create.data.correlationId, ctx.cookie, maxMs);
  let tenantId = poll.data?.tenantId ?? null;
  let tenantStatus = poll.ok ? "active" : poll.status;
  if (tenantId) {
    const detail = await api("GET", `/tenants/${tenantId}`, undefined, ctx.cookie);
    if (detail.ok) tenantStatus = detail.data?.tenant?.status ?? tenantStatus;
  }
  return {
    slug,
    correlationId: create.data.correlationId,
    tenantId,
    poll,
    tenantStatus,
    internalPort: poll.data?.internalPort ?? detailPort(poll.data),
    posUrl: poll.data?.posUrl ?? null,
    baseUrl: poll.data?.baseUrl ?? null,
  };
}

function detailPort(data) {
  return data?.internalPort ?? data?.readiness?.internalPort ?? null;
}

function runShell(cmd, opts = {}) {
  try {
    const out = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
      ...opts,
    });
    return { ok: true, out: out.trim() };
  } catch (err) {
    const stderr = err?.stderr?.toString?.() ?? err?.message ?? String(err);
    return { ok: false, out: stderr.trim() };
  }
}

async function checkSharedInfra() {
  const mysql = runShell(
    `docker exec ${MYSQL_CONTAINER} mysqladmin ping -uroot ${MYSQL_ROOT ? `-p"${MYSQL_ROOT.replace(/"/g, '\\"')}"` : ""} 2>&1`,
  );
  ctx.sharedInfra.MySQL = {
    status: mysql.ok && /alive/i.test(mysql.out) ? "✅" : "❌",
    evidence: `${MYSQL_CONTAINER}: ${mysql.out || "no output"}`,
  };

  const mongo = runShell(
    `docker exec ${MONGO_CONTAINER} mongosh --quiet --eval "try { JSON.stringify(rs.status().ok) } catch(e) { 'standalone:' + db.runCommand({ ping: 1 }).ok }" 2>&1`,
  );
  ctx.sharedInfra["MongoDB RS"] = {
    status: mongo.ok ? "✅" : "❌",
    evidence: `${MONGO_CONTAINER}: ${mongo.out || "no output"}`,
  };

  const redis = runShell(`docker exec ${REDIS_CONTAINER} redis-cli ping 2>&1`);
  ctx.sharedInfra.Redis = {
    status: redis.ok && /PONG/i.test(redis.out) ? "✅" : "❌",
    evidence: `${REDIS_CONTAINER}: ${redis.out || "no output"}`,
  };

  const network = runShell(`docker network ls --format "{{.Name}}" 2>&1`);
  const hasNetwork = network.ok && /stockix-shared|stockix_shared/i.test(network.out);
  ctx.sharedInfra["stockix-shared network"] = {
    status: hasNetwork ? "✅" : "❌",
    evidence: network.out.split("\n").filter(Boolean).slice(0, 8).join(", ") || network.out,
  };
}

async function verifyTenantIsolation(slug) {
  const mysqlSafe = slug.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 28);
  const pattern = `stockix_${mysqlSafe}%`;
  const mysqlQ = MYSQL_ROOT
    ? runShell(
        `docker exec ${MYSQL_CONTAINER} mysql -uroot -p"${MYSQL_ROOT.replace(/"/g, '\\"')}" -e "SHOW DATABASES LIKE '${pattern}';" 2>&1`,
      )
    : { ok: false, out: "SHARED_MYSQL_ROOT_PASSWORD not set" };
  const mongoQ = runShell(
    `docker exec ${MONGO_CONTAINER} mongosh --quiet --eval "db.getMongo().getDBNames().filter(n => n.includes('${slug.replace(/'/g, "")}')).join(',')" 2>&1`,
  );
  const redisQ = runShell(
    `docker exec ${REDIS_CONTAINER} redis-cli --scan --pattern "*${slug}*" 2>&1 | head -5`,
  );
  const traefikQ = runShell(
    `docker ps --format "{{.Names}}" 2>&1 | findstr /i traefik 2>nul || docker ps --format "{{.Names}}" 2>&1 | grep -i traefik || true`,
  );
  ctx.tenantIsolation.push({
    slug,
    mysql: mysqlQ.out.includes("stockix_") ? "present" : "absent",
    mongo: mongoQ.out.trim() ? "present" : "absent",
    redis: `${(redisQ.out.match(/\n/g) ?? []).length + (redisQ.out.trim() ? 1 : 0)} keys`,
    traefik: traefikQ.out.trim() ? "present" : "absent",
  });
}

// ─── Scenarios ─────────────────────────────────────────────
async function scenario01() {
  const t0 = Date.now();
  try {
    const health = await publicApi("GET", "/health");
    const ready = await publicApi("GET", "/ready");
    const apiDown = health.status === 0 || ready.status === 0;
    const healthOk = health.status === 200 && health.data?.status === "ok";
    const readyOk = ready.status === 200 && ready.data?.ready === true;
    const readyDegraded = ready.status === 503;

    if (apiDown || !healthOk) {
      record(
        "S01",
        "API Health Check",
        "FAIL",
        `GET /health → ${health.status}, GET /ready → ${ready.status}`,
        Date.now() - t0,
        truncate({ health: health.data, ready: ready.data }),
        apiDown ? "API not reachable — start pnpm dev (or pnpm --filter api dev)" : "GET /health must return 200 ok",
      );
      ctx.skipAll = true;
      return;
    }
    if (readyOk) {
      record("S01", "API Health Check", "PASS", `GET /health → ${health.status}, GET /ready → ${ready.status}`, Date.now() - t0, truncate({ health: health.data, ready: ready.data }));
      return;
    }
    if (readyDegraded) {
      record(
        "S01",
        "API Health Check",
        "PARTIAL",
        `GET /health → ${health.status}, GET /ready → ${ready.status} (not ready: ${JSON.stringify(ready.data?.checks ?? {})})`,
        Date.now() - t0,
        truncate({ health: health.data, ready: ready.data }),
        "API up but readiness checks failed (DB/Redis)",
      );
      return;
    }
    record(
      "S01",
      "API Health Check",
      "PARTIAL",
      `GET /health → ${health.status}, GET /ready → ${ready.status}`,
      Date.now() - t0,
      truncate({ health: health.data, ready: ready.data }),
      ready.status === 401
        ? "GET /ready returned 401 — RBAC treated /ready as protected (fixed in route-permissions.ts; restart API)"
        : "Expected HTTP 200 on /ready",
    );
  } catch (err) {
    record("S01", "API Health Check", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
    ctx.skipAll = true;
  }
}

async function scenario02() {
  const t0 = Date.now();
  if (ctx.skipAll) {
    record("S02", "Admin Auth", "SKIP", "Skipped — API health failed", Date.now() - t0);
    ctx.skipAuth = true;
    return;
  }
  try {
    if (!ADMIN_EMAIL || !ADMIN_PASS) {
      record("S02", "Admin Auth", "FAIL", "PLATFORM_ADMIN_EMAIL/PASSWORD missing", Date.now() - t0, undefined, "Set credentials in .env");
      ctx.skipAuth = true;
      return;
    }
    const res = await api("POST", "/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASS });
    const cookies = res.headers?.getSetCookie?.() ?? [];
    const raw = cookies.length ? cookies : [res.headers?.get?.("set-cookie")].filter(Boolean);
    const session = raw
      .flatMap((v) => String(v).split(","))
      .map((v) => v.trim())
      .find((v) => v.startsWith("stockix-session="));
    if (res.status === 200 && res.data?.success && session) {
      ctx.cookie = session.split(";")[0];
      record("S02", "Admin Auth", "PASS", `POST /auth/login → ${res.status}, session cookie captured`, Date.now() - t0, "stockix-session=…");
      return;
    }
    record(
      "S02",
      "Admin Auth",
      "FAIL",
      `POST /auth/login → ${res.status}`,
      Date.now() - t0,
      truncate(res.data),
      "Expected 200 with session cookie",
    );
    ctx.skipAuth = true;
  } catch (err) {
    record("S02", "Admin Auth", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
    ctx.skipAuth = true;
  }
}

async function scenario03() {
  const t0 = Date.now();
  if (ctx.skipAuth) {
    record("S03", "Plans: list and create", "SKIP", "Skipped — auth failed", Date.now() - t0);
    return;
  }
  try {
    const list1 = await api("GET", "/plans", undefined, ctx.cookie);
    const plans1 = list1.data?.plans ?? [];
    if (!list1.ok || !Array.isArray(plans1) || plans1.length < 1) {
      record("S03", "Plans: list and create", "FAIL", `GET /plans → ${list1.status}`, Date.now() - t0, truncate(list1.data), "Expected plans array length >= 1");
      return;
    }
    const planSlug = `e2e-plan-${Date.now().toString(36)}`;
    const create = await api(
      "POST",
      "/plans",
      {
        name: "e2e-test-plan",
        slug: planSlug,
        maxOrganizations: 5,
        maxUsers: 10,
        maxActivations: 3,
        priceMonthly: 0,
        billingInterval: "monthly",
      },
      ctx.cookie,
    );
    if (create.status !== 201 || !create.data?.plan?.id) {
      record("S03", "Plans: list and create", "FAIL", `POST /plans → ${create.status}`, Date.now() - t0, truncate(create.data), "Expected 201 with plan.id");
      return;
    }
    ctx.planId = create.data.plan.id;
    const list2 = await api("GET", "/plans", undefined, ctx.cookie);
    const found = (list2.data?.plans ?? []).some((p) => p.id === ctx.planId || p.slug === planSlug);
    record(
      "S03",
      "Plans: list and create",
      found ? "PASS" : "FAIL",
      `Initial count=${plans1.length}, created plan ${planSlug}, list confirms=${found}`,
      Date.now() - t0,
      truncate({ planId: ctx.planId, total: (list2.data?.plans ?? []).length }),
      found ? undefined : "New plan not found in GET /plans",
    );
  } catch (err) {
    record("S03", "Plans: list and create", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario04() {
  const t0 = Date.now();
  if (ctx.skipAuth) {
    record("S04", "Provision: Accounting only", "SKIP", "Skipped — auth failed", Date.now() - t0);
    return;
  }
  try {
    const out = await provisionTenant("acct", "E2E Accounting Tenant", "e2e-acct@test.invalid", ["accounting"], PROVISION_TIMEOUT_MS);
    ctx.acct = out;
    if (out.tenantId) ctx.tenants.push({ id: out.tenantId, slug: out.slug });
    if (out.poll.ok && out.tenantStatus === "active" && out.tenantId) {
      record(
        "S04",
        "Provision: Accounting only",
        "PASS",
        `Tenant ${out.tenantId} active, port=${out.internalPort}`,
        Date.now() - t0,
        truncate({ slug: out.slug, internalPort: out.internalPort, baseUrl: out.baseUrl }),
      );
      await verifyTenantIsolation(out.slug);
      return;
    }
    record(
      "S04",
      "Provision: Accounting only",
      "FAIL",
      `Provision ${out.poll.status}, tenantStatus=${out.tenantStatus}`,
      Date.now() - t0,
      truncate(out.poll.data),
      "Expected status=active within timeout",
    );
  } catch (err) {
    record("S04", "Provision: Accounting only", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario05() {
  const t0 = Date.now();
  const port = ctx.acct.internalPort;
  if (!port) {
    record("S05", "Finance server health", "SKIP", "No internalPort from S04", Date.now() - t0);
    return;
  }
  try {
    const ping = await rawFetch(`http://127.0.0.1:${port}/api/ping`);
    const ok = ping.status === 200 && (ping.data?.pong === true || ping.data?.ok === true || ping.data?.status === "ok");
    if (ok) {
      record("S05", "Finance server health", "PASS", `GET :${port}/api/ping → ${ping.status}`, Date.now() - t0, truncate(ping.data));
      return;
    }
    const health = await rawFetch(`http://127.0.0.1:${port}/health`);
    if (health.status === 200) {
      record("S05", "Finance server health", "PASS", `GET :${port}/health → ${health.status}`, Date.now() - t0, truncate(health.data));
      return;
    }
    record("S05", "Finance server health", "FAIL", `ping=${ping.status}, health=${health.status}`, Date.now() - t0, truncate(ping.data), "Expected 200 pong/ok");
  } catch (err) {
    record("S05", "Finance server health", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario06() {
  const t0 = Date.now();
  const tenantId = ctx.acct.tenantId;
  if (!tenantId) {
    record("S06", "Tenant detail & events", "SKIP", "No tenant from S04", Date.now() - t0);
    return;
  }
  try {
    const detail = await api("GET", `/tenants/${tenantId}`, undefined, ctx.cookie);
    const events = await api("GET", `/tenants/${tenantId}/events`, undefined, ctx.cookie);
    const modules = detail.data?.tenant?.modules ?? [];
    const ev = events.data?.events ?? events.data ?? [];
    const evList = Array.isArray(ev) ? ev : events.data?.events ?? [];
    const ok =
      detail.ok &&
      detail.data?.tenant?.status === "active" &&
      modules.includes("accounting") &&
      events.ok &&
      evList.length > 0;
    record(
      "S06",
      "Tenant detail & events",
      ok ? "PASS" : "FAIL",
      `detail=${detail.status}, events=${events.status}, eventCount=${evList.length}`,
      Date.now() - t0,
      truncate({ status: detail.data?.tenant?.status, modules, eventSample: evList.slice(0, 2) }),
      ok ? undefined : "Expected active tenant with accounting module and non-empty events",
    );
  } catch (err) {
    record("S06", "Tenant detail & events", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario07() {
  const t0 = Date.now();
  const tenantId = ctx.acct.tenantId;
  if (!tenantId) {
    record("S07", "Organization management", "SKIP", "No tenant from S04", Date.now() - t0);
    return;
  }
  try {
    const list1 = await api("GET", `/tenants/${tenantId}/organizations`, undefined, ctx.cookie);
    const orgs1 = list1.data?.organizations ?? [];
    if (!list1.ok || orgs1.length < 1) {
      record("S07", "Organization management", "FAIL", `Initial orgs=${orgs1.length}`, Date.now() - t0, truncate(list1.data), "Expected >= 1 org");
      return;
    }
    const create = await api(
      "POST",
      `/tenants/${tenantId}/organizations`,
      { name: "E2E Second Org" },
      ctx.cookie,
    );
    if (create.status !== 201 || !create.data?.id) {
      record("S07", "Organization management", "FAIL", `POST org → ${create.status}`, Date.now() - t0, truncate(create.data), "Expected 201");
      return;
    }
    ctx.secondOrgId = create.data.id;
    const list2 = await api("GET", `/tenants/${tenantId}/organizations`, undefined, ctx.cookie);
    const patch = await api(
      "PATCH",
      `/tenants/${tenantId}/organizations/${ctx.secondOrgId}`,
      { name: "E2E Org Renamed" },
      ctx.cookie,
    );
    const ok = (list2.data?.organizations ?? []).length >= 2 && patch.status === 200;
    record(
      "S07",
      "Organization management",
      ok ? "PASS" : "FAIL",
      `orgs=${(list2.data?.organizations ?? []).length}, patch=${patch.status}`,
      Date.now() - t0,
      truncate({ secondOrgId: ctx.secondOrgId, patch: patch.data }),
      ok ? undefined : "Expected 2 orgs and PATCH 200",
    );
  } catch (err) {
    record("S07", "Organization management", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario08() {
  const t0 = Date.now();
  const tenantId = ctx.acct.tenantId;
  if (!tenantId || !ctx.secondOrgId) {
    record("S08", "Organization access", "SKIP", "Missing tenant or secondOrgId from S07", Date.now() - t0);
    return;
  }
  try {
    const supportEmail = `e2e-support-${Date.now().toString(36)}@test.invalid`;
    const createOwner = await api("POST", "/owners", { email: supportEmail, name: "E2E Support Agent" }, ctx.cookie);
    if (createOwner.status !== 201 || !createOwner.data?.owner?.id) {
      record("S08", "Organization access", "FAIL", `POST /owners → ${createOwner.status}`, Date.now() - t0, truncate(createOwner.data), "Could not create support owner");
      return;
    }
    ctx.supportOwnerId = createOwner.data.owner.id;
    const patchRole = await api(
      "PATCH",
      `/owners/${ctx.supportOwnerId}`,
      { role: "support_agent" },
      ctx.cookie,
    );
    if (!patchRole.ok) {
      record("S08", "Organization access", "FAIL", `PATCH owner role → ${patchRole.status}`, Date.now() - t0, truncate(patchRole.data), "Could not set support_agent role");
      return;
    }
    const grant = await api(
      "POST",
      `/tenants/${tenantId}/organization-access`,
      { ownerId: ctx.supportOwnerId, organizationId: ctx.secondOrgId },
      ctx.cookie,
    );
    if (grant.status !== 201 && grant.status !== 200) {
      record("S08", "Organization access", "FAIL", `POST access → ${grant.status}`, Date.now() - t0, truncate(grant.data), "Expected 201");
      return;
    }
    const accessId = grant.data?.grant?.id;
    const list = await api("GET", `/tenants/${tenantId}/organization-access`, undefined, ctx.cookie);
    const found = (list.data?.grants ?? []).some((g) => g.id === accessId || g.ownerId === ctx.supportOwnerId);
    const del = accessId
      ? await api("DELETE", `/tenants/${tenantId}/organization-access/${accessId}`, undefined, ctx.cookie)
      : { ok: false, status: 0 };
    const ok = found && del.ok;
    record(
      "S08",
      "Organization access",
      ok ? "PASS" : "FAIL",
      `grant=${grant.status}, listed=${found}, delete=${del.status}`,
      Date.now() - t0,
      truncate({ accessId, grants: list.data?.grants }),
      ok ? undefined : "Grant/list/delete cycle failed",
    );
  } catch (err) {
    record("S08", "Organization access", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario09() {
  const t0 = Date.now();
  const tenantId = ctx.acct.tenantId;
  if (!tenantId) {
    record("S09", "Tenant branding / config", "SKIP", "No tenant from S04", Date.now() - t0);
    return;
  }
  try {
    const get1 = await api("GET", `/tenants/${tenantId}/config`, undefined, ctx.cookie);
    const put = await api(
      "PUT",
      `/tenants/${tenantId}/config`,
      { appName: "E2E Brand", primaryColor: "#ff6600" },
      ctx.cookie,
    );
    const get2 = await api("GET", `/tenants/${tenantId}/config`, undefined, ctx.cookie);
    const ok = get1.ok && put.ok && get2.data?.appName === "E2E Brand";
    record(
      "S09",
      "Tenant branding / config",
      ok ? "PASS" : "FAIL",
      `GET=${get1.status}, PUT=${put.status}, appName=${get2.data?.appName}`,
      Date.now() - t0,
      truncate(get2.data),
      ok ? undefined : "Expected appName roundtrip to E2E Brand",
    );
  } catch (err) {
    record("S09", "Tenant branding / config", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario10() {
  const t0 = Date.now();
  if (ctx.skipAuth) {
    record("S10", "Provision: POS only", "SKIP", "Skipped — auth failed", Date.now() - t0);
    return;
  }
  try {
    const out = await provisionTenant("pos", "E2E POS Tenant", "e2e-pos@test.invalid", ["pos"], PROVISION_TIMEOUT_MS);
    ctx.pos = out;
    if (out.tenantId) ctx.tenants.push({ id: out.tenantId, slug: out.slug });
    const detail = out.tenantId ? await api("GET", `/tenants/${out.tenantId}`, undefined, ctx.cookie) : null;
    const modules = detail?.data?.tenant?.modules ?? [];
    const ok = out.poll.ok && out.tenantStatus === "active" && modules.includes("pos");
    record(
      "S10",
      "Provision: POS only",
      ok ? "PASS" : "FAIL",
      `status=${out.tenantStatus}, modules=${JSON.stringify(modules)}`,
      Date.now() - t0,
      truncate({ tenantId: out.tenantId, posUrl: out.posUrl }),
      ok ? undefined : "Expected active POS tenant",
    );
  } catch (err) {
    record("S10", "Provision: POS only", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario11() {
  const t0 = Date.now();
  if (ctx.skipAuth) {
    record("S11", "Provision: Accounting + POS combined", "SKIP", "Skipped — auth failed", Date.now() - t0);
    return;
  }
  try {
    const out = await provisionTenant(
      "full",
      "E2E Full Tenant",
      "e2e-full@test.invalid",
      ["accounting", "pos"],
      FULL_PROVISION_TIMEOUT_MS,
    );
    ctx.full = out;
    if (out.tenantId) ctx.tenants.push({ id: out.tenantId, slug: out.slug });
    const detail = out.tenantId ? await api("GET", `/tenants/${out.tenantId}`, undefined, ctx.cookie) : null;
    const tenant = detail?.data?.tenant;
    const posUrl = tenant?.deployment?.posUrl ?? out.posUrl;
    ctx.full.posUrl = posUrl;
    ctx.full.posApiUrl = posUrl;
    if (out.tenantStatus === "active") {
      record("S11", "Provision: Accounting + POS combined", "PASS", `Tenant active, posUrl=${posUrl ?? "null"}`, Date.now() - t0, truncate({ tenantId: out.tenantId, posUrl }));
      return;
    }
    if (out.tenantStatus === "partial" && posUrl) {
      record("S11", "Provision: Accounting + POS combined", "PARTIAL", `status=partial with posUrl set`, Date.now() - t0, truncate({ tenantId: out.tenantId, posUrl, partialFailureKind: tenant?.deployment?.partialFailureKind }));
      return;
    }
    record("S11", "Provision: Accounting + POS combined", "FAIL", `status=${out.tenantStatus}`, Date.now() - t0, truncate(out.poll.data), "Expected active or partial with POS");
  } catch (err) {
    record("S11", "Provision: Accounting + POS combined", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario12() {
  const t0 = Date.now();
  const posUrl = ctx.full.posUrl;
  if (!posUrl || !ctx.full.tenantId) {
    record("S12", "POS proxy reachability", "SKIP", "S11 failed or posUrl empty", Date.now() - t0);
    return;
  }
  try {
    const base = String(posUrl).replace(/\/$/, "");
    const health = await rawFetch(`${base}/health`);
    const ping = await rawFetch(`${base}/api/ping`);
    const ok = health.status === 200 || ping.status === 200;
    record(
      "S12",
      "POS proxy reachability",
      ok ? "PASS" : "FAIL",
      `GET ${base}/health → ${health.status}`,
      Date.now() - t0,
      truncate({ health: health.data, ping: ping.data }),
      ok ? undefined : "Expected 200 from POS health/ping",
    );
  } catch (err) {
    record("S12", "POS proxy reachability", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario13() {
  const t0 = Date.now();
  const tenantId = ctx.acct.tenantId;
  const port = ctx.acct.internalPort;
  if (!tenantId || !port) {
    record("S13", "Tenant suspend and reactivate", "SKIP", "Missing acct tenant/port from S04", Date.now() - t0);
    return;
  }
  try {
    const suspend = await api("POST", `/tenants/${tenantId}/suspend`, {}, ctx.cookie);
    if (suspend.status !== 200 && suspend.status !== 202) {
      record("S13", "Tenant suspend and reactivate", "FAIL", `suspend → ${suspend.status}`, Date.now() - t0, truncate(suspend.data), "Expected 200/202");
      return;
    }
    await pollTenantStatus(tenantId, (s) => s === "suspended", 3 * 60 * 1000);
    const afterSuspend = await api("GET", `/tenants/${tenantId}`, undefined, ctx.cookie);
    const pingSuspended = await rawFetch(`http://127.0.0.1:${port}/api/ping`);
    const blocked =
      pingSuspended.status === 401 ||
      pingSuspended.status === 403 ||
      pingSuspended.status === 0 ||
      pingSuspended.status >= 500;
    const reactivate = await api("POST", `/tenants/${tenantId}/reactivate`, {}, ctx.cookie);
    if (reactivate.status !== 200 && reactivate.status !== 202) {
      record("S13", "Tenant suspend and reactivate", "FAIL", `reactivate → ${reactivate.status}`, Date.now() - t0, truncate(reactivate.data), "Expected 200/202");
      return;
    }
    await sleep(10_000);
    await pollTenantStatus(tenantId, (s) => s === "active", 5 * 60 * 1000);
    const pingActive = await rawFetch(`http://127.0.0.1:${port}/api/ping`);
    const ok =
      afterSuspend.data?.tenant?.status === "suspended" &&
      blocked &&
      (pingActive.status === 200 || pingActive.data?.pong === true);
    record(
      "S13",
      "Tenant suspend and reactivate",
      ok ? "PASS" : "FAIL",
      `suspended=${afterSuspend.data?.tenant?.status}, pingAfter=${pingActive.status}`,
      Date.now() - t0,
      truncate({ suspend: suspend.status, reactivate: reactivate.status, pingSuspended: pingSuspended.status }),
      ok ? undefined : "Full suspend/reactivate cycle did not restore finance ping",
    );
  } catch (err) {
    record("S13", "Tenant suspend and reactivate", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario14() {
  const t0 = Date.now();
  const tenantId = ctx.acct.tenantId;
  if (!tenantId) {
    record("S14", "Tenant stop and restart", "SKIP", "No acct tenant from S04", Date.now() - t0);
    return;
  }
  try {
    const stop = await api("POST", `/tenants/${tenantId}/stop`, {}, ctx.cookie);
    if (stop.status !== 200 && stop.status !== 202) {
      record("S14", "Tenant stop and restart", "FAIL", `stop → ${stop.status}`, Date.now() - t0, truncate(stop.data), "Expected 200/202");
      return;
    }
    const stopped = await pollTenantStatus(
      tenantId,
      (s) => s === "stopped" || s === "inactive" || s === "suspended",
      3 * 60 * 1000,
    );
    const reactivate = await api("POST", `/tenants/${tenantId}/reactivate`, {}, ctx.cookie);
    let restarted = false;
    if (reactivate.status === 200 || reactivate.status === 202) {
      const active = await pollTenantStatus(tenantId, (s) => s === "active", 5 * 60 * 1000);
      restarted = active.ok;
    }
    const ok = stopped.ok && restarted;
    record(
      "S14",
      "Tenant stop and restart",
      ok ? "PASS" : reactivate.status === 409 ? "FAIL" : "FAIL",
      `stop=${stop.status}, stoppedStatus=${stopped.status}, reactivate=${reactivate.status}`,
      Date.now() - t0,
      truncate({ stop: stop.data, reactivate: reactivate.data }),
      ok
        ? undefined
        : reactivate.status === 409
          ? "POST /reactivate only accepts suspended tenants (API returns tenant_not_suspended for stopped)"
          : "Stop/restart roundtrip failed",
    );
  } catch (err) {
    record("S14", "Tenant stop and restart", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario15() {
  const t0 = Date.now();
  const tenantId = ctx.acct.tenantId;
  if (!tenantId || ctx.skipAuth) {
    record("S15", "License: generate and assign", "SKIP", "Missing tenant or auth", Date.now() - t0);
    return;
  }
  try {
    const existing = await api("GET", `/licenses?tenantId=${tenantId}`, undefined, ctx.cookie);
    const existingLic = (existing.data?.licenses ?? [])[0];
    if (existingLic?.id) {
      ctx.licenseId = existingLic.id;
      record(
        "S15",
        "License: generate and assign",
        "PASS",
        `Tenant already licensed from provision (${existingLic.id}); assign step skipped`,
        Date.now() - t0,
        truncate(existingLic),
      );
      return;
    }
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const gen = await api(
      "POST",
      "/licenses/generate",
      {
        product: "platform",
        modules: ["accounting"],
        planSlug: "starter",
        expiresAt,
        maxActivations: 3,
        count: 1,
      },
      ctx.cookie,
    );
    const lic = gen.data?.licenses?.[0];
    if (gen.status !== 201 || !lic?.id) {
      record("S15", "License: generate and assign", "FAIL", `generate → ${gen.status}`, Date.now() - t0, truncate(gen.data), "Expected 201");
      return;
    }
    ctx.licenseId = lic.id;
    const get = await api("GET", `/licenses/${ctx.licenseId}`, undefined, ctx.cookie);
    const assign = await api(
      "POST",
      `/licenses/${ctx.licenseId}/assign`,
      { tenantId },
      ctx.cookie,
    );
    const ok = get.ok && (assign.ok || assign.status === 200);
    record(
      "S15",
      "License: generate and assign",
      ok ? "PASS" : "FAIL",
      `generate=${gen.status}, get=${get.status}, assign=${assign.status}`,
      Date.now() - t0,
      truncate({ licenseId: ctx.licenseId, licenseKey: lic.licenseKey?.slice?.(0, 8) }),
      ok ? undefined : "License generate/get/assign failed",
    );
  } catch (err) {
    record("S15", "License: generate and assign", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario16() {
  const t0 = Date.now();
  if (!ctx.licenseId) {
    record("S16", "License: suspend and reactivate", "SKIP", "No licenseId from S15", Date.now() - t0);
    return;
  }
  try {
    const suspend = await api("POST", `/licenses/${ctx.licenseId}/suspend`, {}, ctx.cookie);
    const get1 = await api("GET", `/licenses/${ctx.licenseId}`, undefined, ctx.cookie);
    const reactivate = await api("POST", `/licenses/${ctx.licenseId}/reactivate`, {}, ctx.cookie);
    const get2 = await api("GET", `/licenses/${ctx.licenseId}`, undefined, ctx.cookie);
    const ok =
      suspend.ok &&
      get1.data?.license?.status === "suspended" &&
      reactivate.ok &&
      get2.data?.license?.status === "active";
    record(
      "S16",
      "License: suspend and reactivate",
      ok ? "PASS" : "FAIL",
      `suspend=${suspend.status}, status=${get2.data?.license?.status}`,
      Date.now() - t0,
      truncate(get2.data?.license),
      ok ? undefined : "License suspend/reactivate roundtrip failed",
    );
  } catch (err) {
    record("S16", "License: suspend and reactivate", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario17() {
  const t0 = Date.now();
  if (ctx.skipAuth) {
    record("S17", "License: revoke", "SKIP", "Auth failed", Date.now() - t0);
    return;
  }
  try {
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const gen = await api(
      "POST",
      "/licenses/generate",
      {
        product: "platform",
        modules: ["accounting"],
        planSlug: "starter",
        expiresAt,
        count: 1,
      },
      ctx.cookie,
    );
    const lic = gen.data?.licenses?.[0];
    if (!lic?.id) {
      record("S17", "License: revoke", "FAIL", `generate → ${gen.status}`, Date.now() - t0, truncate(gen.data), "Expected license");
      return;
    }
    ctx.revokeLicenseId = lic.id;
    const revoke = await api("POST", `/licenses/${lic.id}/revoke`, {}, ctx.cookie);
    const get = await api("GET", `/licenses/${lic.id}`, undefined, ctx.cookie);
    const ok = revoke.ok && get.data?.license?.status === "revoked";
    record(
      "S17",
      "License: revoke",
      ok ? "PASS" : "FAIL",
      `revoke=${revoke.status}, status=${get.data?.license?.status}`,
      Date.now() - t0,
      truncate({ revokeLicenseId: lic.id }),
      ok ? undefined : "Expected revoked status",
    );
  } catch (err) {
    record("S17", "License: revoke", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario18() {
  const t0 = Date.now();
  if (!ctx.licenseId) {
    record("S18", "License: extend", "SKIP", "No licenseId from S15", Date.now() - t0);
    return;
  }
  try {
    const before = await api("GET", `/licenses/${ctx.licenseId}`, undefined, ctx.cookie);
    const beforeExp = before.data?.license?.expiresAt ? new Date(before.data.license.expiresAt) : new Date();
    const newExp = new Date(beforeExp.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const extend = await api(
      "POST",
      `/licenses/${ctx.licenseId}/extend`,
      { expiresAt: newExp },
      ctx.cookie,
    );
    const after = await api("GET", `/licenses/${ctx.licenseId}`, undefined, ctx.cookie);
    const afterExp = after.data?.license?.expiresAt ? new Date(after.data.license.expiresAt) : null;
    const ok = extend.ok && afterExp && afterExp.getTime() >= beforeExp.getTime();
    record(
      "S18",
      "License: extend",
      ok ? "PASS" : "FAIL",
      `extend=${extend.status}, before=${before.data?.license?.expiresAt}, after=${after.data?.license?.expiresAt}`,
      Date.now() - t0,
      truncate(after.data?.license),
      ok ? undefined : "expiresAt did not move forward",
    );
  } catch (err) {
    record("S18", "License: extend", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario19() {
  const t0 = Date.now();
  const scripts = [
    "infra/prod/backup/backup.sh",
    "infra/prod/backup/backup-shared.sh",
    "infra/prod/monitoring/healthcheck.sh",
  ];
  try {
    let allOk = true;
    for (const rel of scripts) {
      const abs = resolve(REPO_ROOT, rel);
      const exists = existsSync(abs);
      let syntaxOk = false;
      let notes = "";
      if (exists) {
        const check = runShell(`bash -n "${abs}"`);
        syntaxOk = check.ok;
        if (!check.ok) notes = check.out;
      } else {
        allOk = false;
        notes = "File not found";
      }
      if (!exists || !syntaxOk) allOk = false;
      ctx.backupScripts.push({ script: rel, exists, syntaxOk, notes });
    }
    record(
      "S19",
      "Backup scripts exist and are executable",
      allOk ? "PASS" : "FAIL",
      `${scripts.length} scripts checked`,
      Date.now() - t0,
      truncate(ctx.backupScripts),
      allOk ? undefined : "One or more scripts missing or failed bash -n",
    );
  } catch (err) {
    record("S19", "Backup scripts exist and are executable", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

async function scenario20() {
  const t0 = Date.now();
  if (ctx.skipAuth) {
    record("S20", "Deprovision all test tenants (cleanup)", "SKIP", "Auth failed — manual cleanup may be required", Date.now() - t0);
    return;
  }
  const ids = [...new Set(ctx.tenants.map((t) => t.id).filter(Boolean))];
  if (ids.length === 0) {
    record("S20", "Deprovision all test tenants (cleanup)", "SKIP", "No test tenants were created", Date.now() - t0);
    return;
  }
  try {
    const failures = [];
    for (const tenantId of ids) {
      const del = await api("DELETE", `/tenants/${tenantId}?volumes=true`, undefined, ctx.cookie);
      if (del.status !== 200 && del.status !== 202) {
        failures.push(`${tenantId}: DELETE → ${del.status}`);
        continue;
      }
      const gone = await pollTenantDeleted(tenantId);
      if (!gone.ok) {
        failures.push(`${tenantId}: still exists after deprovision timeout`);
      }
    }
    let mysqlClean = true;
    if (MYSQL_ROOT) {
      const dbCheck = runShell(
        `docker exec ${MYSQL_CONTAINER} mysql -uroot -p"${MYSQL_ROOT.replace(/"/g, '\\"')}" -e "SHOW DATABASES LIKE 'stockix_e2e%';" 2>&1`,
      );
      mysqlClean = dbCheck.ok && !dbCheck.out.includes("stockix_e2e");
    }
    const orphan = runShell("npx tsx infra/worker-service/scripts/audit-orphan-dbs.ts", { cwd: REPO_ROOT });
    const orphanOk = orphan.ok && /None found/i.test(orphan.out);
    const ok = failures.length === 0 && mysqlClean && orphanOk;
    record(
      "S20",
      "Deprovision all test tenants (cleanup)",
      ok ? "PASS" : failures.length ? "FAIL" : "PARTIAL",
      `deleted=${ids.length}, failures=${failures.length}, mysqlClean=${mysqlClean}, orphanAudit=${orphanOk}`,
      Date.now() - t0,
      truncate({ failures, mysqlClean, orphan: orphan.out.slice(0, 500) }),
      ok ? undefined : failures.join("; ") || "Shared infra cleanup incomplete",
    );
  } catch (err) {
    record("S20", "Deprovision all test tenants (cleanup)", "FAIL", err instanceof Error ? err.message : String(err), Date.now() - t0, undefined, String(err));
  }
}

// ─── Report ────────────────────────────────────────────────
function statusEmoji(status) {
  if (status === "PASS") return "✅ PASS";
  if (status === "FAIL") return "❌ FAIL";
  if (status === "PARTIAL") return "⚠️ PARTIAL";
  return "⏭️ SKIP";
}

function getBranch() {
  const r = runShell("git rev-parse --abbrev-ref HEAD", { cwd: REPO_ROOT });
  return r.ok ? r.out : "architecture";
}

function writeReport() {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0, PARTIAL: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const total = results.length;
  const verdict =
    counts.FAIL > 0 ? "FAIL" : counts.PARTIAL > 0 ? "PARTIAL" : counts.PASS === total ? "PASS" : "PARTIAL";
  const verdictExplain =
    counts.FAIL > 0
      ? `${counts.FAIL} scenario(s) failed — see Open Issues.`
      : counts.PARTIAL > 0
        ? `${counts.PARTIAL} scenario(s) partially passed.`
        : counts.SKIP > 0
          ? `${counts.SKIP} scenario(s) skipped; remaining checks passed.`
          : "All executed scenarios passed.";

  const scenarioBlocks = results
    .map(
      (r) => `### ${r.id} — ${r.title}
**Status:** ${statusEmoji(r.status)}
**Duration:** ${r.durationMs}ms
**Detail:** ${r.detail}
**Evidence:** ${r.evidence ? `\n\`\`\`json\n${r.evidence}\n\`\`\`` : "[none]"}
${r.issue ? `**Issue (if fail):** ${r.issue}` : ""}`,
    )
    .join("\n\n");

  const sharedRows = Object.entries(ctx.sharedInfra)
    .map(([k, v]) => `| ${k} | ${v.status} | ${v.evidence.replace(/\|/g, "\\|")} |`)
    .join("\n");

  const isolationRows =
    ctx.tenantIsolation.length > 0
      ? ctx.tenantIsolation
          .map(
            (t) =>
              `| ${t.slug} | ${t.mysql} | ${t.mongo} | ${t.redis} | ${t.traefik} |`,
          )
          .join("\n")
      : "| [TO BE FILLED] | — | — | — | — |";

  const backupRows = ctx.backupScripts
    .map(
      (b) =>
        `| ${b.script} | ${b.exists ? "✅" : "❌"} | ${b.syntaxOk ? "✅" : "❌"} | ${b.notes || ""} |`,
    )
    .join("\n");

  const openIssues = results
    .filter((r) => r.status === "FAIL")
    .map(
      (r) =>
        `- **${r.id} — ${r.title}:** ${r.issue ?? r.detail}\n  - Expected vs actual: ${r.detail}`,
    )
    .join("\n");

  const working = results
    .filter((r) => r.status === "PASS")
    .map((r) => `- **${r.id}:** ${r.detail}`)
    .join("\n");

  const md = `# Stockix E2E Audit Results
**Date:** ${new Date().toISOString()}
**Environment:** ${API}
**Branch:** ${getBranch()}

## Summary
| Total | Pass | Fail | Skip | Partial |
|-------|------|------|------|---------|
| ${total}    | ${counts.PASS}    | ${counts.FAIL}    | ${counts.SKIP}    | ${counts.PARTIAL}       |

## Verdict
${verdict} — ${verdictExplain}

## Scenario Results
${scenarioBlocks || "_No scenarios executed — [TO BE FILLED]_"}

## Shared Infrastructure Check
| Component | Status | Evidence |
|-----------|--------|----------|
${sharedRows || "| MySQL | [TO BE FILLED] | — |\n| MongoDB RS | [TO BE FILLED] | — |\n| Redis | [TO BE FILLED] | — |\n| stockix-shared network | [TO BE FILLED] | — |"}

## Tenant Isolation Verification
| Tenant slug | MySQL DBs | Mongo DB | Redis keys | Traefik YAML |
|-------------|-----------|----------|------------|--------------|
${isolationRows}

## Backup Scripts Audit
| Script | Exists | Syntax valid | Notes |
|--------|--------|--------------|-------|
${backupRows || "| backup.sh | [TO BE FILLED] | [TO BE FILLED] | |\n| backup-shared.sh | [TO BE FILLED] | [TO BE FILLED] | |\n| healthcheck.sh | [TO BE FILLED] | [TO BE FILLED] | |"}

## Open Issues Found
${openIssues || "_None — [TO BE FILLED on first run]_"}

## What is Working
${working || "_Run \`pnpm audit:e2e\` to populate — [TO BE FILLED]_"}
`;

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, md, "utf8");
  log("📝", "Report written", REPORT_PATH);
}

async function runScenario(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`Unhandled scenario error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  console.log(`\nStockix E2E Audit — ${API}\nSlug base: ${TEST_SLUG_BASE}\n`);
  await checkSharedInfra();

  const scenarios = [
    scenario01,
    scenario02,
    scenario03,
    scenario04,
    scenario05,
    scenario06,
    scenario07,
    scenario08,
    scenario09,
    scenario10,
    scenario11,
    scenario12,
    scenario13,
    scenario14,
    scenario15,
    scenario16,
    scenario17,
    scenario18,
    scenario19,
    scenario20,
  ];

  const skipTitles = {
    scenario02: "Admin Auth",
    scenario03: "Plans: list and create",
    scenario04: "Provision: Accounting only",
    scenario05: "Finance server health",
    scenario06: "Tenant detail & events",
    scenario07: "Organization management",
    scenario08: "Organization access",
    scenario09: "Tenant branding / config",
    scenario10: "Provision: POS only",
    scenario11: "Provision: Accounting + POS combined",
    scenario12: "POS proxy reachability",
    scenario13: "Tenant suspend and reactivate",
    scenario14: "Tenant stop and restart",
    scenario15: "License: generate and assign",
    scenario16: "License: suspend and reactivate",
    scenario17: "License: revoke",
    scenario18: "License: extend",
    scenario19: "Backup scripts exist and are executable",
  };

  for (const fn of scenarios) {
    if (ctx.skipAll && fn !== scenario01 && fn !== scenario19 && fn !== scenario20) {
      const num = fn.name.replace("scenario", "");
      const id = `S${num.padStart(2, "0")}`;
      record(id, skipTitles[fn.name] ?? fn.name, "SKIP", "Skipped — API unavailable", 0);
      continue;
    }
    await runScenario(fn);
  }

  writeReport();
  const failed = results.filter((r) => r.status === "FAIL").length;
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  writeReport();
  process.exitCode = 1;
});
