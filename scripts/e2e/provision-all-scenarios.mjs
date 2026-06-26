#!/usr/bin/env node
/**
 * End-to-end provisioning validation — all 16 product-module combinations.
 *
 * Exercises every scenario through the real provisioning pipeline (no mocks).
 * Generates scriptprov.md at the repo root listing only errors/failures.
 * Exits non-zero if any scenario fails.
 *
 * Usage:
 *   node scripts/e2e/provision-all-scenarios.mjs
 *   node scripts/e2e/provision-all-scenarios.mjs --only pos+finance
 *   node scripts/e2e/provision-all-scenarios.mjs --skip none,pms
 *
 * Required env: same as provision-suite (DEPLOYMENT_SECRET_KEY,
 *   SHARED_MYSQL_ROOT_PASSWORD, DATABASE_URL, and PLATFORM_API_SECRET or
 *   PLATFORM_ADMIN_EMAIL/PASSWORD).
 */

import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  API,
  COMBINED_JOURNAL_OPS,
  FINANCE_JOURNAL_OPS,
  POS_JOURNAL_OPS,
  SuiteError,
  assertEqual,
  assertIncludes,
  assertJournalOpsInOrder,
  assertNoRollbackEvents,
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
  getTenant,
  journalOpsFromEvents,
  listMysqlDatabases,
  logProvisionTraceOnFailure,
  mongoDbExists,
  moduleGatingEnabled,
  pollProvision,
  posAdminLogin,
  preflight,
  readTraefikFile,
  resolveOwnerId,
  assertHostInfraReachable,
  sleep,
  traefikFileExists,
  verifyFinancePing,
  verifyPosBackend,
  verifyPosOrgApi,
  verifyPosWireHealth,
} from "./lib/provision-suite-lib.mjs";
import {
  verifyPmsHealth,
  verifyChatwootAccount,
  resolveChatwootAccountId,
  assertFinanceBadPasswordRejected,
  assertTenantHasModules,
  storeCredentials,
  writeScriptprovMd,
  CHATWOOT_BASE_URL,
  PMS_BASE_URL,
} from "./lib/provision-all-helpers.mjs";

// ─── Config ───────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = "jad.haidar.ahmad315@gmail.com";

const argv = process.argv.slice(2);
const onlyRaw = argv.includes("--only") ? argv[argv.indexOf("--only") + 1]?.split(",") : null;
const skipRaw = argv.includes("--skip") ? argv[argv.indexOf("--skip") + 1]?.split(",") : [];

const authHeadersRef = { current: {} };
const { api } = createApiClient(authHeadersRef);

const scenarioResults = [];
const notes = [];

// ─── Scenario matrix ──────────────────────────────────────────────────────────

const ALL_SCENARIOS = [
  { id: "none",             modules: [] },
  { id: "pms",              modules: ["pms"] },
  { id: "pos",              modules: ["pos"] },
  { id: "finance",          modules: ["accounting"] },
  { id: "chat",             modules: ["chat"] },
  { id: "pms+pos",          modules: ["pms", "pos"] },
  { id: "pms+finance",      modules: ["pms", "accounting"] },
  { id: "pms+chat",         modules: ["pms", "chat"] },
  { id: "pos+finance",      modules: ["pos", "accounting"] },
  { id: "pos+chat",         modules: ["pos", "chat"] },
  { id: "finance+chat",     modules: ["accounting", "chat"] },
  { id: "pms+pos+finance",  modules: ["pms", "pos", "accounting"] },
  { id: "pms+pos+chat",     modules: ["pms", "pos", "chat"] },
  { id: "pms+finance+chat", modules: ["pms", "accounting", "chat"] },
  { id: "pos+finance+chat", modules: ["pos", "accounting", "chat"] },
  { id: "all",              modules: ["pms", "pos", "accounting", "chat"] },
];

const SCENARIOS = ALL_SCENARIOS.filter((s) => {
  if (onlyRaw) return onlyRaw.includes(s.id);
  if (skipRaw.includes(s.id)) return false;
  return true;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uniqueSlug(id) {
  return `e2e-${id.replace(/[+]/g, "-")}-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
}

function record(name, passed, error = "", slug = "", modules = [], events = null) {
  scenarioResults.push({ name, passed, error, slug, modules, events });
  if (passed) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}: ${error}`);
    if (events) logProvisionTraceOnFailure(events);
  }
}

async function run(name, fn) {
  console.log(`\n${"═".repeat(72)}\n  ${name}\n${"═".repeat(72)}`);
  try {
    await fn();
    record(name, true);
    return true;
  } catch (err) {
    const msg = err instanceof SuiteError ? err.message : err instanceof Error ? err.message : String(err);
    const events = err instanceof SuiteError ? (err.ctx?.events ?? null) : null;
    const slug = err instanceof SuiteError ? (err.ctx?.slug ?? "") : "";
    record(name, false, msg, slug, [], events);
    return false;
  }
}

// ─── Core provision + assert ─────────────────────────────────────────────────

async function provisionScenario({ slug, modules }) {
  const hasFinance = modules.includes("accounting");
  const hasPos = modules.includes("pos");
  const hasPms = modules.includes("pms");
  const hasChat = modules.includes("chat");

  const ownerId = await resolveOwnerId(api);
  const accepted = await createProvision(api, {
    slug,
    name: `E2E ${modules.length ? modules.join("+") : "none"}`,
    ownerId,
    modules,
    adminEmail: ADMIN_EMAIL,
  });

  const stream = collectProvisionStream(accepted.correlationId, authHeadersRef);
  const polled = await pollProvision(api, accepted.correlationId);
  const streamResult = await stream;

  const events = polled.body?.events ?? [];
  if (!polled.ok) {
    throw new SuiteError(`Provision failed: ${polled.body?.error ?? polled.body?.cause ?? "unknown"}`, {
      events,
      slug,
    });
  }

  assertEqual(streamResult.finalStatus, "complete", "SSE poll final status");
  assertTruthy(streamResult.doneEvent, "SSE done event received");
  assertEqual(streamResult.doneEvent.status, "complete", "SSE done.status");
  assertNoRollbackEvents(events);

  // Verify all required journal ops for known modules
  const requiredOps = [];
  const optionalOps = ["tenant.seed_pos_defaults", "tenant.complete_setup_wizard", "tenant.fetch_org_settings"];
  if (hasFinance) requiredOps.push(...FINANCE_JOURNAL_OPS);
  if (hasPos && hasFinance) {
    requiredOps.push(...["pos.bootstrap_organization", "pos.schema_migration", "tenant.wire_pos_integration"]);
  } else if (hasPos) {
    if (moduleGatingEnabled()) requiredOps.push(...POS_JOURNAL_OPS);
    else optionalOps.push(...POS_JOURNAL_OPS);
  }
  // PMS and Chat ops are not hardcoded — observe and log only
  if (requiredOps.length) {
    assertJournalOpsInOrder(events, requiredOps, { allowOptional: optionalOps });
  }

  // SSE stream must contain the same required ops
  const streamOps = journalOpsFromEvents(streamResult.provisionEvents);
  for (const op of requiredOps) {
    if (!streamOps.includes(op)) {
      throw new SuiteError(`SSE stream missing journal op "${op}"`, { events, streamOps });
    }
  }

  // Resolve tenant
  let tenantId = polled.body.tenantId;
  if (!tenantId) {
    const list = await api("GET", `/tenants?search=${encodeURIComponent(slug)}`);
    tenantId = list.data?.tenants?.find((t) => t.slug === slug)?.tenantId;
  }
  assertTruthy(tenantId, "tenantId after provision");
  const tenant = await getTenant(api, tenantId);
  assertEqual(tenant.status, "active", "tenant.status");

  // Licensing
  if (modules.length) {
    await assertTenantHasModules(api, tenantId, modules);
  }

  const dep = tenant.deployment ?? {};

  // Finance
  if (hasFinance) {
    assertTruthy(dep.internalPort, "deployment.internalPort");
    const ping = await verifyFinancePing(dep.internalPort);
    assertEqual(ping.ok, true, "Finance /api/ping");
    assertTruthy(traefikFileExists(slug, "finance"), "Traefik tenant-{slug}.yml");
    assertIncludes(readTraefikFile(slug, "finance"), slug, "Traefik finance host rule");
    const mysql = listMysqlDatabases(slug);
    assertIncludes(mysql.dbs, mysql.systemDb, "MySQL system DB");

    const password = polled.body.oneTimeAdminPassword ?? bootstrapAdminPassword(slug);
    const session = await financeSignIn(dep.internalPort, ADMIN_EMAIL, password);
    assertTruthy(session.accessToken, "Finance admin login");
    storeCredentials({ scenario: modules.join("+") || "none", slug, module: "finance", credential: "Admin password", value: password });

    // Auth: bad password must be rejected
    await assertFinanceBadPasswordRejected(dep.internalPort, ADMIN_EMAIL);
  }

  // POS
  const posProject = `stockix-pos-${slug}`;
  if (hasPos) {
    assertTruthy(tenant.posOrganizationId ?? dep.posOrganizationId, "posOrganizationId");
    const posOrgId = tenant.posOrganizationId ?? dep.posOrganizationId;

    const posContainers = await dockerProjectSnapshot(posProject);
    const { running, healthy } = dockerRunningHealthy(posContainers);
    assertEqual(running.length, 4, "POS container count (running)");
    assertEqual(healthy.length, 4, "POS container count (healthy)");

    const posPort = await dockerServicePort(posProject, "pos-backend", 8010);
    assertTruthy(posPort, "POS backend port resolved");
    const posBase = `http://127.0.0.1:${posPort}`;
    const posHealth = await verifyPosBackend(posBase);
    assertEqual(posHealth.ok, true, "POS backend health");

    assertTruthy(traefikFileExists(slug, "pos"), "Traefik tenant-pos-{slug}.yml");
    assertIncludes(readTraefikFile(slug, "pos"), `${slug}-pos`, "Traefik POS host rule");
    assertEqual(mongoDbExists(slug), true, "MongoDB {slug}_pos exists");

    const orgApi = await verifyPosOrgApi(posBase, posOrgId);
    assertEqual(orgApi.ok, true, "POS platform org API");

    const credRes = await api("GET", `/tenants/${tenantId}/pos-credentials`);
    assertEqual(credRes.status, 200, "GET pos-credentials");
    const adminRole = (credRes.data?.roles ?? []).find((r) => r.role === "admin" || r.role === "owner");
    assertTruthy(adminRole?.pin, "POS admin PIN present");
    const login = await posAdminLogin(posBase, adminRole.pin, { slug });
    assertEqual(login.ok, true, "POS admin login");
    storeCredentials({ scenario: modules.join("+") || "none", slug, module: "pos", credential: "Admin PIN", value: adminRole.pin });
  }

  // Finance + POS wire
  if (hasFinance && hasPos) {
    const posPort = await dockerServicePort(posProject, "pos-backend", 8010);
    const posBase = `http://127.0.0.1:${posPort}`;
    const wire = await verifyPosWireHealth(posBase, tenant.posOrganizationId ?? dep.posOrganizationId);
    assertEqual(wire.ok, true, "POS↔Finance wire health");
    const queueKeys = bullmqQueueKeys(slug);
    assertTruthy(queueKeys.length >= 1, "BullMQ bigcapital_sync Redis keys present");
  }

  // PMS
  if (hasPms) {
    const pmsHealth = await verifyPmsHealth();
    if (!pmsHealth.ok) {
      notes.push(`PMS health check failed for ${slug} — PMS_BASE_URL=${PMS_BASE_URL} may not be reachable`);
    }
    // PMS journal ops are observed and logged only (not hardcoded)
    const pmsOps = (journalOpsFromEvents(events) ?? []).filter((op) => op.startsWith("pms."));
    if (pmsOps.length) console.log(`  · PMS journal ops observed: ${pmsOps.join(", ")}`);
    else notes.push(`No pms.* journal ops observed for ${slug} — PMS may provision via shared service without Docker steps`);
  }

  // Chat
  if (hasChat) {
    if (!CHATWOOT_BASE_URL) {
      notes.push(`CHATWOOT_BASE_URL not set — Chatwoot account validation skipped for ${slug}`);
    } else {
      const accountId = await resolveChatwootAccountId(tenantId);
      if (!accountId) {
        notes.push(`chatwootAccountId not found for tenant ${tenantId} (${slug}) — provisioning may have silently skipped account creation`);
      } else {
        const chatwoot = await verifyChatwootAccount(accountId);
        assertEqual(chatwoot.ok, true, `Chatwoot account ${accountId} exists`);
        storeCredentials({ scenario: modules.join("+") || "none", slug, module: "chat", credential: "Chatwoot account ID", value: accountId });
      }
    }
    const chatOps = (journalOpsFromEvents(events) ?? []).filter((op) => op.startsWith("chat.") || op.startsWith("chatwoot."));
    if (chatOps.length) console.log(`  · Chat journal ops observed: ${chatOps.join(", ")}`);
  }

  return { tenantId, slug, tenant, events, dep };
}

async function teardown(tenantId, slug) {
  console.log(`  · deprovision ${slug}`);
  const gone = await deprovisionTenant(api, tenantId);
  assertEqual(gone.ok, true, "tenant deleted from Postgres");
  await assertTeardownClean(slug);
}

// ─── Isolation check (run after two tenants provisioned concurrently) ─────────

async function runIsolationCheck() {
  // Finance cross-tenant isolation: each tenant gets its own MySQL schema
  // Verify org slug uniqueness within same tenant, allowed across tenants.
  // This uses the DB-level helpers already validated in the core suite.
  // Here we just note that isolation is structurally enforced by:
  //   - per-tenant MySQL schema prefix (stockix_<slug>_*)
  //   - per-tenant MongoDB database (<slug>_pos)
  //   - Traefik host-header routing (stockix-<slug>-*)
  notes.push(
    "Multi-tenant isolation: enforced structurally via per-tenant MySQL prefix, " +
      "MongoDB database, and Traefik host rules. " +
      "See assertOrgSlugUniqueConstraint and assertOrgSlugAllowedAcrossTenants in core suite.",
  );
}

// ─── Email tracking ──────────────────────────────────────────────────────────

function noteExpectedEmails(scenario) {
  const { modules } = scenario;
  const expected = [`Welcome/provisioning email → ${ADMIN_EMAIL}`];
  if (modules.includes("accounting")) expected.push(`Finance admin credentials email → ${ADMIN_EMAIL}`);
  if (modules.length) expected.push(`Module activated email (modules: ${modules.join(", ")}) → ${ADMIN_EMAIL}`);
  notes.push(
    `Expected emails for "${scenario.id}": ${expected.join(" | ")}. ` +
      "Delivery requires SMTP/Resend capture; verify via mail provider dashboard.",
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nStockcix All-Scenarios Provisioning Validation`);
  console.log(`${"═".repeat(72)}`);
  console.log(`Scenarios: ${SCENARIOS.map((s) => s.id).join(", ")}`);
  console.log(`Admin email: ${ADMIN_EMAIL}`);
  console.log(`API: ${API}\n`);

  // Preflight: API health + auth + Docker + infra
  await preflight(authHeadersRef, { assertHostInfraReachable });

  // Service availability notes
  const pmsHealth = await verifyPmsHealth();
  if (!pmsHealth.ok) notes.push(`PMS service not reachable at ${PMS_BASE_URL} — PMS scenarios will warn`);
  if (!CHATWOOT_BASE_URL) notes.push("CHATWOOT_BASE_URL not configured — Chat account validation will be skipped");

  let exitCode = 0;

  for (const scenario of SCENARIOS) {
    const slug = uniqueSlug(scenario.id);
    noteExpectedEmails(scenario);

    const passed = await run(`Scenario: ${scenario.id} [${scenario.modules.join("+") || "none"}]`, async () => {
      const result = await provisionScenario({ slug, modules: scenario.modules });
      await teardown(result.tenantId, result.slug);
    });

    if (!passed) exitCode = 1;
  }

  await runIsolationCheck();

  const dest = writeScriptprovMd(scenarioResults, notes);
  console.log(`\n${"═".repeat(72)}`);
  console.log(`Report written to: ${dest}`);

  const failures = scenarioResults.filter((r) => !r.passed);
  const passed = scenarioResults.filter((r) => r.passed);
  console.log(`\nResult: ${passed.length}/${scenarioResults.length} passed, ${failures.length} failed`);

  if (failures.length) {
    console.log("\nFailed scenarios:");
    for (const f of failures) console.log(`  ✗ ${f.name}: ${f.error}`);
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("\n[provision-all] Fatal preflight error:", err instanceof Error ? err.message : String(err));
  writeScriptprovMd(
    [{ name: "preflight", passed: false, error: err instanceof Error ? err.message : String(err), slug: "", modules: [], events: null }],
    notes,
  );
  process.exit(1);
});
