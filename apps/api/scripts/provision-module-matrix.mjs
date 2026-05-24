/**
 * Provision module matrix — accounting only, POS only, and accounting+POS.
 *
 * Usage (repo root):
 *   pnpm provision:modules
 *   pnpm provision:modules -- --only accounting
 *   pnpm provision:modules -- --only pos
 *   pnpm provision:modules -- --only both
 *   pnpm provision:modules -- --preflight
 *
 * Prerequisites:
 *   - Platform API: pnpm --filter api dev (or full `pnpm dev`)
 *   - Worker: `pnpm infra:worker:dev` (or included in `pnpm dev`)
 *   - Docker running; Finance/POS images available (first run can take 15–45m)
 *   - DB seeded: pnpm --filter @repo/db db:seed:local
 *   - For POS: pnpm pos:images:build then per-tenant stockix-pos-{slug} compose
 *
 * Env: STOCKIX_API_URL, OWNER_ID, PROVISION_ADMIN_EMAIL, PROVISION_POLL_MS,
 *      PROVISION_MAX_MS, POS_PLATFORM_BASE_URL, POS_PLATFORM_API_KEY,
 *      PROVISION_MODULE_GATING (default on — set 0 for legacy always-Finance mode)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, moduleGatingConfig } from "@repo/config";
import { execa } from "execa";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const posAppRaw = process.env.POS_APP_ROOT?.trim() || path.join("services", "posnew");
const POS_APP_ROOT = path.isAbsolute(posAppRaw) ? posAppRaw : path.join(REPO_ROOT, posAppRaw);
const POS_COMPOSE = path.join(REPO_ROOT, "infra", "pos-tenant-stack", "docker-compose.yml");

const API = env.STOCKIX_API_URL.replace(/\/$/, "");
const POLL_MS = env.PROVISION_POLL_MS;
const MAX_MS = env.PROVISION_MAX_MS;
const POS_BASE = (process.env.POS_PLATFORM_BASE_URL ?? "http://localhost:8010").replace(
  /\/+$/,
  "",
);
const POS_API_KEY = (process.env.POS_PLATFORM_API_KEY ?? "").trim();

/** @type {Record<string, string>} */
let authHeaders = {};

const argv = process.argv.slice(2);
const preflightOnly = argv.includes("--preflight");
const onlyArg = argValue("--only");

const SCENARIOS = [
  {
    id: "accounting",
    label: "Accounting only",
    modules: ["accounting"],
    expectFinance: true,
    expectPos: false,
    expectWarehouseOp: true,
    expectSeedPosDefaults: false,
  },
  {
    id: "pos",
    label: "POS only",
    modules: ["pos"],
    expectFinance: () => !moduleGatingEnabled(),
    expectPos: true,
    expectWarehouseOp: () => !moduleGatingEnabled(),
    expectSeedPosDefaults: false,
  },
  {
    id: "both",
    label: "Accounting + POS",
    modules: ["accounting", "pos"],
    expectFinance: true,
    expectPos: true,
    expectWarehouseOp: true,
    expectSeedPosDefaults: true,
  },
];

function argValue(flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  return argv[i + 1] ?? null;
}

function moduleGatingEnabled() {
  return moduleGatingConfig.enabled;
}

function resolveExpect(value) {
  return typeof value === "function" ? value() : value;
}

async function readJson(res) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : {};
  } catch {
    return { _raw: t };
  }
}

function fail(msg, extra) {
  console.error("\n❌", msg);
  if (extra != null) console.error(JSON.stringify(extra, null, 2));
  process.exit(1);
}

function section(title) {
  console.log(`\n${"═".repeat(72)}\n  ${title}\n${"═".repeat(72)}`);
}

function ok(msg) {
  console.log("  ✓", msg);
}

function warn(msg) {
  console.log("  ⚠", msg);
}

function note(msg) {
  console.log("  ·", msg);
}

function apiHeaders(extra = {}) {
  return { ...authHeaders, ...extra };
}

async function resolveAuth() {
  const bearer =
    argValue("--auth-bearer")
    ?? process.env.PROVISION_AUTH_BEARER
    ?? "";
  const cookie = argValue("--cookie") ?? process.env.PROVISION_COOKIE ?? "";
  const platformSecret = env.PLATFORM_API_SECRET ?? process.env.PLATFORM_API_SECRET ?? "";

  if (bearer) {
    authHeaders = { Authorization: `Bearer ${bearer}` };
    return "bearer";
  }
  if (cookie) {
    authHeaders = { Cookie: cookie };
    return "cookie";
  }
  if (platformSecret) {
    authHeaders = { Authorization: `Bearer ${platformSecret}` };
    return "platform_api_secret";
  }

  const email = process.env.PLATFORM_ADMIN_EMAIL ?? "";
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    fail(
      "API requires auth. Set PLATFORM_API_SECRET, PROVISION_COOKIE, PROVISION_AUTH_BEARER, or PLATFORM_ADMIN_EMAIL + PLATFORM_ADMIN_PASSWORD in .env",
    );
  }

  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer local-dev",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    fail(`POST /auth/login → HTTP ${res.status}`, await readJson(res));
  }
  const setCookies = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean);
  const session = setCookies
    .map((line) => String(line))
    .find((line) => line.startsWith("stockix-session="));
  if (!session) {
    fail("Login succeeded but stockix-session cookie missing");
  }
  authHeaders = { Cookie: session.split(";")[0] };
  return "login";
}

async function preflight() {
  section("Preflight");
  const h = await fetch(`${API}/health`);
  const hj = await readJson(h);
  if (!h.ok) fail(`GET /health → HTTP ${h.status}`, hj);
  ok(`API healthy (${API})`);

  const authMode = await resolveAuth();
  ok(`Auth: ${authMode}`);

  const oRes = await fetch(`${API}/owners`, { headers: apiHeaders() });
  const o = await readJson(oRes);
  if (!oRes.ok) fail(`GET /owners → HTTP ${oRes.status}`, o);
  if (!(o.owners ?? []).length) {
    fail("No owners — run: pnpm --filter @repo/db db:seed:local");
  }
  ok(`Owners: ${o.owners.length}`);

  try {
    await execa("docker", ["info"], { stdio: "pipe" });
    ok("Docker reachable");
  } catch (e) {
    fail("Docker not running or not on PATH", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  note(`PROVISION_MODULE_GATING=${moduleGatingEnabled() ? "1" : "0"}`);
  if (!moduleGatingEnabled()) {
    warn(
      "POS-only scenario will still provision Finance when PROVISION_MODULE_GATING=0 (legacy mode).",
    );
  }

  try {
    const res = await fetch(`${POS_BASE}/health`, { signal: AbortSignal.timeout(4_000) });
    if (res.ok) ok(`POS platform health (${POS_BASE})`);
    else warn(`POS health HTTP ${res.status} — POS scenarios may fail if backend is down`);
  } catch (e) {
    warn(
      `POS backend not reachable at ${POS_BASE}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!POS_API_KEY) {
    warn("POS_PLATFORM_API_KEY unset — org API verification will be skipped");
  }

  try {
    await execa(
      "docker",
      ["compose", "-f", POS_COMPOSE, "config"],
      {
        env: {
          ...process.env,
          STOCKIX_REPO_ROOT: REPO_ROOT,
          POS_APP_ROOT,
          COMPOSE_PROJECT_NAME: "stockix-pos-preflight",
        },
        stdio: "pipe",
      },
    );
    ok(`POS compose config valid (POS_APP_ROOT=${POS_APP_ROOT})`);
  } catch (e) {
    fail("POS docker-compose config invalid — run pnpm pos:images:build", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function resolveOwnerId() {
  if (env.OWNER_ID) return env.OWNER_ID;
  const oRes = await fetch(`${API}/owners`, { headers: apiHeaders() });
  const o = await readJson(oRes);
  if (!oRes.ok) fail(`GET /owners → HTTP ${oRes.status}`, o);
  const owners = o.owners ?? [];
  if (!owners.length) fail("No owners in database");
  return owners[0].id;
}

async function createProvisionJob({ slug, name, ownerId, modules }) {
  const res = await fetch(`${API}/tenants`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json",
      "Idempotency-Key": `mod-${slug}`,
    }),
    body: JSON.stringify({
      slug,
      name,
      owner_id: ownerId,
      admin_email: env.PROVISION_ADMIN_EMAIL,
      admin_first_name: "Module",
      admin_last_name: "Matrix",
      modules,
    }),
  });
  const body = await readJson(res);
  if (res.status !== 202 || !body.accepted || !body.correlationId) {
    fail("POST /tenants expected HTTP 202 accepted", { status: res.status, body });
  }
  return body;
}

async function pollProvision(correlationId) {
  const t0 = Date.now();
  const deadline = Date.now() + MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch(`${API}/tenants/provision-status/${correlationId}`, {
      headers: apiHeaders(),
    });
    const body = await readJson(res);
    if (res.status === 404) fail("provision-status 404", body);
    if (!res.ok) fail(`provision-status HTTP ${res.status}`, body);

    if (body.status === "failed") {
      return { ok: false, body, elapsedSec: Math.round((Date.now() - t0) / 1000) };
    }
    if (body.status === "complete") {
      return { ok: true, body, elapsedSec: Math.round((Date.now() - t0) / 1000) };
    }
    process.stdout.write(
      `    poll ${body.status} ${Math.round((Date.now() - t0) / 1000)}s\r`,
    );
  }
  return {
    ok: false,
    body: { status: "timeout", error: `exceeded ${MAX_MS}ms` },
    elapsedSec: Math.round((Date.now() - t0) / 1000),
  };
}

async function getTenant(tenantId) {
  const res = await fetch(`${API}/tenants/${tenantId}`, { headers: apiHeaders() });
  const body = await readJson(res);
  if (!res.ok) fail(`GET /tenants/${tenantId} → HTTP ${res.status}`, body);
  return body.tenant;
}

async function resolveTenantId(status, slug) {
  if (typeof status.tenantId === "string" && status.tenantId.length > 0) {
    return status.tenantId;
  }
  for (const event of [...(status.events ?? [])].reverse()) {
    const meta = event?.meta;
    if (meta && typeof meta === "object" && typeof meta.tenantId === "string") {
      return meta.tenantId;
    }
  }
  const res = await fetch(
    `${API}/tenants?search=${encodeURIComponent(slug)}&pageSize=10`,
    { headers: apiHeaders() },
  );
  const body = await readJson(res);
  if (!res.ok) fail(`GET /tenants?search=${slug} → HTTP ${res.status}`, body);
  const row = (body.tenants ?? []).find((t) => t.slug === slug);
  return row?.tenantId ?? null;
}

async function dockerProjectSnapshot(project) {
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

function dockerHasRunning(containers) {
  return containers.some(
    (c) => c.status.toLowerCase().includes("up") && !c.status.toLowerCase().includes("exited"),
  );
}

async function dockerServerHostPort(project) {
  try {
    const { stdout } = await execa("docker", [
      "compose",
      "-p",
      project,
      "port",
      "server",
      "3000",
    ]);
    const match = stdout.trim().match(/:(\d+)\s*$/);
    return match?.[1] ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function dockerPosBackendPort(project) {
  try {
    const { stdout } = await execa("docker", [
      "compose",
      "-p",
      project,
      "port",
      "pos-backend",
      "8010",
    ]);
    const match = stdout.trim().match(/:(\d+)\s*$/);
    return match?.[1] ? Number(match[1]) : null;
  } catch {
    try {
      const { stdout } = await execa("docker", [
        "compose",
        "-p",
        project,
        "port",
        "backend",
        "8010",
      ]);
      const match = stdout.trim().match(/:(\d+)\s*$/);
      return match?.[1] ? Number(match[1]) : null;
    } catch {
      return null;
    }
  }
}

async function verifyFinancePing(project, internalPortFromDb) {
  let port = internalPortFromDb;
  if (!port || port <= 0) {
    port = await dockerServerHostPort(project);
  }
  if (!port) {
    return { ok: false, reason: "no_finance_port" };
  }
  const urls = [
    `http://127.0.0.1:${port}/api/ping/`,
    `http://127.0.0.1:${port}/api/ping`,
  ];
  let lastError = "unknown";
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        if (res.ok) return { ok: true, url, status: res.status };
        lastError = `HTTP ${res.status} @ ${url}`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return { ok: false, reason: lastError };
}

async function verifyPosOrg(orgId, backendPort) {
  if (!orgId) return { ok: false, reason: "missing_posOrganizationId" };
  const base =
    backendPort && backendPort > 0
      ? `http://127.0.0.1:${backendPort}`
      : POS_BASE;
  const url = `${base}/api/platform/v1/organizations/${orgId}`;
  const headers = {
    Accept: "application/json",
    "X-Forwarded-Proto": "https",
  };
  if (POS_API_KEY) headers["X-Api-Key"] = POS_API_KEY;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
    const json = await readJson(res);
    if (res.ok && (json.success === true || json.data?._id || json.data?.id)) {
      return { ok: true, url, orgId };
    }
    return { ok: false, reason: `HTTP ${res.status}`, body: json };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

function eventsForOp(events, opKey) {
  return events.filter(
    (e) =>
      e?.phase === opKey
      || (e?.meta && typeof e.meta === "object" && e.meta.operationKey === opKey),
  );
}

function assertNoFailedOps(events, keys) {
  const problems = [];
  for (const key of keys) {
    const rows = eventsForOp(events, key);
    for (const row of rows) {
      if (row.level === "error") {
        problems.push({ op: key, message: row.message });
      }
    }
  }
  return problems;
}

async function runScenario(scenario, ownerId) {
  const slug = `mod-${scenario.id}-${Date.now().toString(36)}`;
  const expectFinance = resolveExpect(scenario.expectFinance);
  const expectPos = resolveExpect(scenario.expectPos);
  const expectWarehouse = resolveExpect(scenario.expectWarehouseOp);
  const expectSeed = resolveExpect(scenario.expectSeedPosDefaults);

  section(`${scenario.label}  (slug=${slug}, modules=${scenario.modules.join(",")})`);

  const accepted = await createProvisionJob({
    slug,
    name: `Module matrix ${scenario.label}`,
    ownerId,
    modules: scenario.modules,
  });
  note(`correlationId=${accepted.correlationId}`);
  note(`poll ${API}/tenants/provision-status/${accepted.correlationId}`);

  const polled = await pollProvision(accepted.correlationId);
  console.log("");
  if (!polled.ok) {
    return {
      scenario: scenario.id,
      label: scenario.label,
      slug,
      passed: false,
      error: polled.body.error ?? polled.body.cause ?? polled.body.status,
      events: polled.body.events?.slice?.(-8) ?? [],
    };
  }

  ok(`Provision complete in ${polled.elapsedSec}s`);
  const status = polled.body;
  const events = Array.isArray(status.events) ? status.events : [];
  const tenantId = await resolveTenantId(status, slug);
  if (!tenantId) {
    return {
      scenario: scenario.id,
      label: scenario.label,
      slug,
      passed: false,
      error: "complete_without_tenantId",
    };
  }
  note(`tenantId=${tenantId}`);

  const tenant = await getTenant(tenantId);
  const dep = tenant.deployment ?? {};
  const financeProject = dep.composeProjectName ?? `stockix-${slug}`;
  const posProject = `stockix-pos-${slug}`;

  const checks = [];

  if (expectFinance) {
    if (dep.financeTenantId != null && Number(dep.financeTenantId) > 0) {
      ok(`financeTenantId=${dep.financeTenantId}`);
    } else {
      checks.push("expected financeTenantId > 0");
    }
    if (dep.internalPort != null && Number(dep.internalPort) > 0) {
      ok(`internalPort=${dep.internalPort}`);
    } else {
      checks.push("expected internalPort > 0");
    }
    const financeDocker = await dockerProjectSnapshot(financeProject);
    if (dockerHasRunning(financeDocker)) {
      ok(`Finance compose running (${financeProject}, ${financeDocker.length} container(s))`);
    } else {
      checks.push(`Finance docker not running for ${financeProject}`);
      note(JSON.stringify(financeDocker.slice(0, 4)));
    }
    const ping = await verifyFinancePing(financeProject, dep.internalPort);
    if (ping.ok) ok(`Finance API ping ${ping.url}`);
    else checks.push(`Finance ping failed: ${ping.reason}`);
    if (expectWarehouse) {
      const whProblems = assertNoFailedOps(events, ["tenant.activate_warehouses"]);
      if (whProblems.length) checks.push(`activate_warehouses errors: ${JSON.stringify(whProblems)}`);
      else if (eventsForOp(events, "tenant.activate_warehouses").length) {
        ok("tenant.activate_warehouses traced");
      } else {
        warn("tenant.activate_warehouses not in event log (may be skipped)");
      }
      if (dep.financeDefaultWarehouseId != null && Number(dep.financeDefaultWarehouseId) > 0) {
        ok(`financeDefaultWarehouseId=${dep.financeDefaultWarehouseId}`);
      } else if (expectWarehouse) {
        checks.push("expected financeDefaultWarehouseId after warehouse step");
      }
    }
  } else {
    if (dep.financeTenantId == null || Number(dep.financeTenantId) <= 0) {
      ok("No finance tenant (POS-only gating)");
    } else {
      checks.push(`unexpected financeTenantId=${dep.financeTenantId} for POS-only+gating`);
    }
  }

  if (expectPos) {
    if (tenant.posOrganizationId) {
      ok(`posOrganizationId=${tenant.posOrganizationId}`);
    } else {
      checks.push("expected posOrganizationId");
    }
    if (dep.posUrl) ok(`posUrl=${dep.posUrl}`);
    else checks.push("expected deployment.posUrl");

    const posDocker = await dockerProjectSnapshot(posProject);
    const posPort = await dockerPosBackendPort(posProject);
    if (dockerHasRunning(posDocker)) {
      ok(`POS compose running (${posProject})`);
    } else {
      warn(
        `No running POS compose project ${posProject} — using shared POS at ${POS_BASE} if dev stack is up`,
      );
    }
    const orgCheck = await verifyPosOrg(tenant.posOrganizationId, posPort);
    if (orgCheck.ok) ok(`POS org API OK (${orgCheck.url})`);
    else if (!POS_API_KEY) warn(`Skipped POS org API check: ${orgCheck.reason}`);
    else checks.push(`POS org API: ${orgCheck.reason}`);

    const posStackFailed = events.some(
      (e) =>
        e.phase === "pos.stack.failed"
        || (e.meta?.operationKey === "pos.stack" && e.level === "error"),
    );
    if (posStackFailed) {
      checks.push("pos.stack.failed in provision events");
    } else if (eventsForOp(events, "pos.stack").length || events.some((e) => e.phase === "pos.stack.completed")) {
      ok("pos.stack traced");
    }

    const posProblems = assertNoFailedOps(events, [
      "tenant.provision_pos_stack",
      "tenant.bootstrap_pos",
      "tenant.wire_pos_integration",
    ]);
    if (posProblems.length) {
      checks.push(`POS provision errors: ${JSON.stringify(posProblems)}`);
    }
    if (scenario.id === "both" && eventsForOp(events, "tenant.wire_pos_integration").length === 0) {
      checks.push("expected tenant.wire_pos_integration for accounting+pos");
    }
  } else {
    if (!tenant.posOrganizationId) ok("No POS organization (accounting-only)");
    else checks.push(`unexpected posOrganizationId=${tenant.posOrganizationId}`);
  }

  if (expectSeed) {
    const seedProblems = assertNoFailedOps(events, ["tenant.seed_pos_defaults"]);
    if (seedProblems.length) checks.push(`seed_pos_defaults errors: ${JSON.stringify(seedProblems)}`);
    else if (eventsForOp(events, "tenant.seed_pos_defaults").length) {
      ok("tenant.seed_pos_defaults traced");
    } else {
      checks.push("expected tenant.seed_pos_defaults in events for accounting+pos");
    }
    if (dep.financeWalkInCustomerId != null && Number(dep.financeWalkInCustomerId) > 0) {
      ok(`financeWalkInCustomerId=${dep.financeWalkInCustomerId}`);
    } else {
      checks.push("expected financeWalkInCustomerId after seed_pos_defaults");
    }
  } else {
    const seedRows = eventsForOp(events, "tenant.seed_pos_defaults");
    const seedRan = seedRows.some((r) => r.level !== "error" && !String(r.message).includes("Skipped"));
    if (seedRan) checks.push("seed_pos_defaults ran but was not expected for this scenario");
  }

  if (tenant.status === "active") ok(`tenant.status=active`);
  else if (expectPos && tenant.status === "partial") {
    checks.push(
      `tenant.status=partial — POS required but incomplete (retry POS or check deployment.lastError: ${dep.lastError ?? "n/a"})`,
    );
  } else {
    checks.push(`unexpected tenant.status=${tenant.status}`);
  }

  if (dep.status === "active" || dep.status === "partial") {
    ok(`deployment.status=${dep.status}`);
  } else if (dep.status) {
    checks.push(`deployment.status=${dep.status} lastError=${dep.lastError ?? ""}`);
  }

  const passed = checks.length === 0;
  if (passed) ok("Scenario passed");
  else {
    for (const c of checks) console.log("  ✗", c);
  }

  return {
    scenario: scenario.id,
    label: scenario.label,
    slug,
    tenantId,
    correlationId: accepted.correlationId,
    passed,
    checks,
    elapsedSec: polled.elapsedSec,
    financeTenantId: dep.financeTenantId,
    posOrganizationId: tenant.posOrganizationId,
    internalPort: dep.internalPort,
  };
}

async function main() {
  console.log("Provision module matrix");
  console.log("API:", API);
  console.log("POLL_MS:", POLL_MS, "MAX_MS:", MAX_MS);

  await preflight();
  if (preflightOnly) {
    console.log("\nPreflight only — exit 0");
    return;
  }

  let scenarios = SCENARIOS;
  if (onlyArg) {
    const id = onlyArg.toLowerCase();
    if (id === "all") {
      scenarios = SCENARIOS;
    } else {
      scenarios = SCENARIOS.filter((s) => s.id === id);
      if (!scenarios.length) {
        fail(`Unknown --only value "${onlyArg}". Use: accounting | pos | both | all`);
      }
    }
  }

  const ownerId = await resolveOwnerId();
  note(`owner_id=${ownerId}`);
  note(`admin_email=${env.PROVISION_ADMIN_EMAIL}`);

  const results = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario, ownerId);
    results.push(result);
  }

  section("Summary");
  let allPassed = true;
  for (const r of results) {
    const mark = r.passed ? "PASS" : "FAIL";
    console.log(
      `  [${mark}] ${r.label} slug=${r.slug}${r.elapsedSec != null ? ` (${r.elapsedSec}s)` : ""}`,
    );
    if (!r.passed) {
      allPassed = false;
      if (r.error) console.log("       error:", r.error);
      if (r.checks?.length) console.log("       checks:", r.checks.join("; "));
    }
  }

  console.log("");
  if (allPassed) {
    console.log("All module scenarios passed.");
    return;
  }
  fail("One or more module scenarios failed", { results });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
