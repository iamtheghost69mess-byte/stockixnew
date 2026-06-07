#!/usr/bin/env node
/**
 * Stockix end-to-end provisioning test suite.
 *
 * Usage:
 *   pnpm test:e2e
 *   pnpm test:e2e -- --only finance|pos|combined|multi-org|failure|correlation|preflight
 *
 * Prerequisites: pnpm dev (API + worker + shared infra), tenant images built.
 * After changing worker failure injection, run: pnpm infra:worker:build
 */

import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  API,
  COMBINED_EXTRA_OPS,
  FINANCE_JOURNAL_OPS,
  POS_JOURNAL_OPS,
  SuiteError,
  assertEqual,
  assertIncludes,
  assertJournalOpsInOrder,
  assertNoRollbackEvents,
  assertOrgSlugAllowedAcrossTenants,
  assertOrgSlugUniqueConstraint,
  assertTeardownClean,
  assertTruthy,
  bootstrapAdminPassword,
  bullmqQueueKeys,
  collectProvisionStream,
  createApiClient,
  createProvision,
  deprovisionTenant,
  dockerProjectSnapshot,
  dockerRunningHealthy,
  dockerServicePort,
  financeSignIn,
  financeSwitchTenant,
  getTenant,
  journalOpsFromEvents,
  listMysqlDatabases,
  logProvisionTraceOnFailure,
  moduleGatingEnabled,
  mongoDbExists,
  pollProvision,
  posAdminLogin,
  preflight,
  readTraefikFile,
  loginAsOwner,
  resolveOwnerId,
  setOwnerPasswordForE2e,
  assertHostInfraReachable,
  sleep,
  traefikFileExists,
  verifyFinancePing,
  verifyPosBackend,
  verifyPosOrgApi,
  verifyPosWireHealth,
} from "./lib/provision-suite-lib.mjs";

const authHeadersRef = { current: {} };
const { api } = createApiClient(authHeadersRef);

const argv = process.argv.slice(2);
const onlyArg = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : "all";
const runAll = onlyArg === "all";

const results = [];

function uniqueSlug(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function record(name, passed, detail = "", events = null) {
  results.push({ name, passed, detail });
  console.log(passed ? `  ✓ ${name}` : `  ✗ ${name}: ${detail}`);
  if (!passed && events) logProvisionTraceOnFailure(events);
}

async function runScenario(name, fn) {
  console.log(`\n${"═".repeat(72)}\n  ${name}\n${"═".repeat(72)}`);
  try {
    await fn();
    record(name, true);
    return true;
  } catch (err) {
    const msg = err instanceof SuiteError ? err.message : err instanceof Error ? err.message : String(err);
    record(name, false, msg, err instanceof SuiteError ? err.ctx?.events : err.ctx?.events ?? null);
    if (err instanceof SuiteError && err.ctx?.events) logProvisionTraceOnFailure(err.ctx.events);
    return false;
  }
}

async function provisionAndAssert({
  slug,
  modules,
  requiredJournalOps,
  optionalJournalOps = [
    "tenant.seed_pos_defaults",
    "tenant.complete_setup_wizard",
    "tenant.fetch_org_settings",
  ],
  expectFinance = false,
  expectPos = false,
}) {
  const ownerId = await resolveOwnerId(api);
  const accepted = await createProvision(api, {
    slug,
    name: `E2E ${modules.join("+")}`,
    ownerId,
    modules,
  });
  const stream = collectProvisionStream(accepted.correlationId, authHeadersRef);
  const polled = await pollProvision(api, accepted.correlationId);
  const streamResult = await stream;

  const events = polled.body?.events ?? [];
  if (!polled.ok) {
    throw new SuiteError(`Provision failed: ${polled.body?.error ?? polled.body?.cause ?? "unknown"}`, {
      events,
    });
  }

  assertEqual(streamResult.finalStatus, "complete", "SSE poll final status");
  assertTruthy(streamResult.doneEvent, "SSE done event");
  assertEqual(streamResult.doneEvent.status, "complete", "SSE done.status");
  assertJournalOpsInOrder(events, requiredJournalOps, { allowOptional: optionalJournalOps });
  assertNoRollbackEvents(events);

  const streamJournalOps = journalOpsFromEvents(streamResult.provisionEvents);
  for (const op of requiredJournalOps) {
    if (!streamJournalOps.includes(op)) {
      throw new SuiteError(`SSE stream missing journal op ${op}`, {
        events,
        streamJournalOps,
      });
    }
  }

  let tenantId = polled.body.tenantId;
  if (!tenantId) {
    const list = await api("GET", `/tenants?search=${encodeURIComponent(slug)}`);
    tenantId = list.data?.tenants?.find((t) => t.slug === slug)?.tenantId;
  }
  assertTruthy(tenantId, "tenantId after provision");
  const tenant = await getTenant(api, tenantId);
  assertEqual(tenant.status, "active", "tenant.status");
  assertTruthy(tenant.deployment, "tenant.deployment");

  const dep = tenant.deployment;
  const financeProject = dep.composeProjectName ?? `stockix-${slug}`;
  const posProject = `stockix-pos-${slug}`;

  if (expectFinance) {
    assertTruthy(dep.internalPort, "deployment.internalPort");
    const ping = await verifyFinancePing(dep.internalPort);
    assertEqual(ping.ok, true, "Finance /api/ping");
    assertTruthy(traefikFileExists(slug, "finance"), "Traefik tenant-{slug}.yml");
    const traefik = readTraefikFile(slug, "finance");
    assertIncludes(traefik, slug, "Traefik finance host rule");

    const mysql = listMysqlDatabases(slug);
    assertIncludes(mysql.dbs, mysql.systemDb, "MySQL system DB");
    assertTruthy(tenant.deployment.financeOrganizationId ?? tenant.financeOrganizationId, "financeOrganizationId");

    const password = tenant.deployment.financeAdminPassword ?? bootstrapAdminPassword(slug);
    const adminEmail = tenant.adminEmail;
    const session = await financeSignIn(dep.internalPort, adminEmail, password);
    assertTruthy(session.accessToken, "Finance admin session");

    const orgs = await api("GET", `/tenants/${tenantId}/organizations`);
    assertTruthy(orgs.ok, "GET organizations");
    assertTruthy((orgs.data?.organizations ?? []).length >= 1, "organization count");
  }

  if (expectPos) {
    assertTruthy(tenant.posOrganizationId, "posOrganizationId");
    const posContainers = await dockerProjectSnapshot(posProject);
    const { running, healthy } = dockerRunningHealthy(posContainers);
    assertEqual(running.length, 4, "POS container count (running)");
    assertEqual(healthy.length, 4, "POS container count (healthy)");

    const posPort = await dockerServicePort(posProject, "pos-backend", 8010);
    const posBase = posPort ? `http://127.0.0.1:${posPort}` : null;
    assertTruthy(posBase, "POS backend port");
    const posHealth = await verifyPosBackend(posBase);
    assertEqual(posHealth.ok, true, "POS backend health");

    assertTruthy(traefikFileExists(slug, "pos"), "Traefik tenant-pos-{slug}.yml");
    const posTraefik = readTraefikFile(slug, "pos");
    assertIncludes(posTraefik, `${slug}-pos`, "Traefik POS host rule");

    assertEqual(mongoDbExists(slug), true, "MongoDB {slug}_pos exists");

    const orgApi = await verifyPosOrgApi(posBase, tenant.posOrganizationId);
    assertEqual(orgApi.ok, true, "POS platform org API");

    const credRes = await api("GET", `/tenants/${tenantId}/pos-credentials`);
    assertEqual(credRes.status, 200, "GET pos-credentials");
    const adminRole = (credRes.data?.roles ?? []).find((r) => r.role === "admin" || r.role === "owner");
    assertTruthy(adminRole?.pin && !adminRole.masked, "POS admin PIN");
    const login = await posAdminLogin(posBase, adminRole.pin);
    assertEqual(login.ok, true, "POS admin login");
  }

  if (expectFinance && expectPos) {
    const posPort = await dockerServicePort(posProject, "pos-backend", 8010);
    const posBase = `http://127.0.0.1:${posPort}`;
    const wire = await verifyPosWireHealth(posBase, tenant.posOrganizationId);
    assertEqual(wire.ok, true, "POS↔Finance wire health");
    const queueKeys = bullmqQueueKeys(slug);
    assertTruthy(queueKeys.length >= 1, "BullMQ bigcapital_sync Redis keys");
    assertEqual(tenant.slug, slug, "cross-module slug consistency");
  }

  return { tenantId, slug, tenant, events, correlationId: accepted.correlationId, dep };
}

async function teardownTenant(tenantId, slug) {
  console.log(`  · deprovision ${tenantId} (${slug})`);
  const gone = await deprovisionTenant(api, tenantId);
  assertEqual(gone.ok, true, "tenant deleted from Postgres");
  assertTeardownClean(slug);
}

async function scenarioFinanceOnly() {
  const slug = uniqueSlug("e2e-fin");
  const { tenantId, events } = await provisionAndAssert({
    slug,
    modules: ["accounting"],
    requiredJournalOps: FINANCE_JOURNAL_OPS,
    expectFinance: true,
    expectPos: false,
  });
  await teardownTenant(tenantId, slug);
  return { events };
}

async function scenarioPosOnly() {
  if (!moduleGatingEnabled()) {
    throw new SuiteError("POS-only journal path requires PROVISION_MODULE_GATING=1");
  }
  const slug = uniqueSlug("e2e-pos");
  const { tenantId } = await provisionAndAssert({
    slug,
    modules: ["pos"],
    requiredJournalOps: POS_JOURNAL_OPS,
    expectFinance: false,
    expectPos: true,
  });
  await teardownTenant(tenantId, slug);
}

async function scenarioCombined() {
  const slug = uniqueSlug("e2e-full");
  const ctx = await provisionAndAssert({
    slug,
    modules: ["accounting", "pos"],
    requiredJournalOps: [...FINANCE_JOURNAL_OPS, ...POS_JOURNAL_OPS, ...COMBINED_EXTRA_OPS],
    expectFinance: true,
    expectPos: true,
  });
  return ctx;
}

async function scenarioMultiOrg(combinedCtx) {
  const { tenantId, slug, tenant } = combinedCtx;
  const port = tenant.deployment.internalPort;
  const password = tenant.deployment.financeAdminPassword ?? bootstrapAdminPassword(slug);
  const adminEmail = tenant.adminEmail;

  const orgs1 = await api("GET", `/tenants/${tenantId}/organizations`);
  const primary = (orgs1.data?.organizations ?? [])[0];
  assertTruthy(primary?.id, "primary org");

  const create2 = await api("POST", `/tenants/${tenantId}/organizations`, { name: "E2E Second Org" });
  assertEqual(create2.status, 201, "POST second organization");
  const org2Id = create2.data?.id;
  assertTruthy(org2Id, "second org id");

  const orgs2 = await api("GET", `/tenants/${tenantId}/organizations`);
  assertEqual((orgs2.data?.organizations ?? []).length >= 2, true, "org count >= 2");

  const org2Row = (orgs2.data?.organizations ?? []).find((o) => o.id === org2Id);
  assertTruthy(org2Row?.financeOrganizationId, "org2 financeOrganizationId");

  let session = await financeSignIn(port, adminEmail, password);
  session = await financeSwitchTenant(port, session.accessToken, primary.financeOrganizationId);
  assertEqual(String(session.organizationId), String(primary.financeOrganizationId), "JWT org1");

  session = await financeSwitchTenant(port, session.accessToken, org2Row.financeOrganizationId);
  assertEqual(String(session.organizationId), String(org2Row.financeOrganizationId), "JWT org2");

  const mysql = listMysqlDatabases(slug);
  assertIncludes(mysql.dbs, mysql.systemDb, "system DB");
  assertTruthy(
    mysql.dbs.some((d) => d.includes(String(primary.financeOrganizationId).replace(/-/g, "_")) ||
      mysql.dbs.length >= 2),
    "org-specific MySQL DBs",
  );

  await assertOrgSlugUniqueConstraint(tenantId, primary.slug);

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const sql = (await import("postgres")).default;
    const pg = sql(dbUrl, { max: 1 });
    try {
      const [otherTenant] = await pg`SELECT id FROM tenants WHERE id <> ${tenantId} LIMIT 1`;
      if (otherTenant?.id) {
        await assertOrgSlugAllowedAcrossTenants(tenantId, otherTenant.id, primary.slug);
      }
    } finally {
      await pg.end({ timeout: 5 });
    }
  }

  await teardownTenant(tenantId, slug);
}

async function scenarioFailureInjection() {
  const slug = uniqueSlug("e2e-fail-inject");
  const ownerId = await resolveOwnerId(api);
  const accepted = await createProvision(api, {
    slug,
    name: "E2E failure injection",
    ownerId,
    modules: ["accounting"],
  });
  const polled = await pollProvision(api, accepted.correlationId);
  assertEqual(polled.ok, false, "provision should fail");
  const events = polled.body?.events ?? [];
  assertIncludes(journalOpsFromEvents(events), "docker.data_step", "journaled docker.data_step before crash");

  let tenantId = polled.body?.tenantId;
  if (!tenantId) {
    const list = await api("GET", `/tenants?search=${encodeURIComponent(slug)}`);
    tenantId = list.data?.tenants?.find((t) => t.slug === slug)?.tenantId;
  }
  assertTruthy(tenantId, "tenantId on failed provision");
  const tenant = await getTenant(api, tenantId);
  assertEqual(tenant.status, "failed", "tenant.status after rollback");

  const mysqlBefore = listMysqlDatabases(slug);
  if (mysqlBefore.dbs.length) {
    await sleep(5000);
  }
  const mysqlAfter = listMysqlDatabases(slug);
  assertEqual(mysqlAfter.dbs.length, 0, "MySQL DBs cleaned after rollback");
  assertEqual(mongoDbExists(slug), false, "Mongo cleaned after rollback");
  assertEqual(bullmqQueueKeys(slug).length, 0, "Redis keys cleaned after rollback");

  await deprovisionTenant(api, tenantId);
}

async function scenarioCorrelation403() {
  const slug = uniqueSlug("e2e-corr");
  const ownerId = await resolveOwnerId(api);
  const accepted = await createProvision(api, {
    slug,
    name: "E2E correlation auth",
    ownerId,
    modules: ["accounting"],
  });

  const foreignEmail = `e2e-foreign-${Date.now().toString(36)}@test.invalid`;
  const foreignPassword = `E2e-${randomUUID().slice(0, 12)}!aA1`;
  const createOwner = await api("POST", "/owners", { email: foreignEmail, name: "E2E Foreign Owner" });
  assertEqual(createOwner.status, 201, "create foreign owner");
  await setOwnerPasswordForE2e(foreignEmail, foreignPassword, "read_only");

  const foreignHeaders = { current: {} };
  await loginAsOwner(foreignEmail, foreignPassword, foreignHeaders);
  const foreignApi = createApiClient(foreignHeaders).api;

  const denied = await foreignApi("GET", `/tenants/provision-status/${accepted.correlationId}`);
  assertEqual(denied.status, 403, "foreign owner provision-status");
  const deniedStream = await fetch(`${API}/tenants/provision-stream/${accepted.correlationId}`, {
    headers: foreignHeaders.current,
  });
  assertEqual(deniedStream.status, 403, "foreign owner provision-stream");

  const polled = await pollProvision(api, accepted.correlationId);
  assertEqual(polled.ok, true, "owner provision completes");
  await teardownTenant(polled.body.tenantId, slug);
}

async function main() {
  console.log("Stockix provision E2E suite");
  console.log("API:", API);

  if (onlyArg === "preflight") {
    await preflight(authHeadersRef, { assertHostInfraReachable });
    console.log("Preflight OK");
    return;
  }

  await preflight(authHeadersRef, { assertHostInfraReachable });

  const scenarios = [];
  if (onlyArg === "failure") {
    scenarios.push(["Failure injection — rollback after docker.data_step", scenarioFailureInjection]);
  } else if (runAll) {
    scenarios.push(["Failure injection — rollback after docker.data_step", scenarioFailureInjection]);
  }

  if (onlyArg === "finance") scenarios.push(["Scenario 1 — Finance-only", scenarioFinanceOnly]);
  else if (runAll) scenarios.push(["Scenario 1 — Finance-only", scenarioFinanceOnly]);

  if (onlyArg === "pos") scenarios.push(["Scenario 2 — POS-only", scenarioPosOnly]);
  else if (runAll) scenarios.push(["Scenario 2 — POS-only", scenarioPosOnly]);

  if (onlyArg === "combined") {
    scenarios.push([
      "Scenario 3 — Finance + POS",
      async () => {
        const ctx = await scenarioCombined();
        await teardownTenant(ctx.tenantId, ctx.slug);
      },
    ]);
  } else if (runAll || onlyArg === "multi-org") {
    scenarios.push([
      "Scenario 3+4 — Finance + POS + multi-org isolation",
      async () => {
        const ctx = await scenarioCombined();
        await scenarioMultiOrg(ctx);
      },
    ]);
  }

  if (onlyArg === "correlation") scenarios.push(["Correlation route 403 — foreign owner", scenarioCorrelation403]);
  else if (runAll) scenarios.push(["Correlation route 403 — foreign owner", scenarioCorrelation403]);

  if (!scenarios.length) {
    console.error(`Unknown --only value: ${onlyArg}`);
    process.exit(1);
  }

  let failed = 0;
  for (const [label, fn] of scenarios) {
    const ok = await runScenario(label, fn);
    if (!ok) failed += 1;
  }

  console.log(`\n${"─".repeat(72)}`);
  console.log(`Results: ${results.length - failed}/${results.length} passed`);
  for (const r of results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
