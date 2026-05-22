#!/usr/bin/env node
/**
 * Organization create + tenant app URL smoke test
 * ================================================
 *
 * Verifies the full path platform operators care about:
 *   1. POS API is reachable
 *   2. Platform owner can authenticate
 *   3. POST /api/platform/v1/organizations succeeds
 *   4. Organization record is readable and (when applicable) bootstrapped
 *   5. Tenant app base URL responds for `/?org=<slug>` (redirect to login with org)
 *   6. After bootstrap, admin PIN from org defaultCredentials signs in (POST /api/auth/login)
 *
 * Prerequisites
 * -------------
 * - API running (default http://127.0.0.1:8010)
 * - MongoDB configured the same as the API
 * - Platform owner seeded: `npm run seed:platform-owner` (see .env.example)
 * - Tenant Next app running if you want step 5 (default http://localhost:3000)
 *
 * Environment
 * -----------
 *   PLATFORM_OWNER_EMAIL / PLATFORM_OWNER_PASSWORD  (required)
 *   ORG_TENANT_SELFTEST_API_BASE   (default: http://127.0.0.1:8010)
 *   ORG_TENANT_SELFTEST_TENANT_APP_BASE  (default: http://localhost:3000)
 *   ORG_TENANT_SELFTEST_SKIP_TENANT_HTTP=1  — skip HTTP checks to tenant app
 *   ORG_TENANT_SELFTEST_SKIP_PIN=1  — skip PIN login check
 *   ORG_TENANT_SELFTEST_BOOTSTRAP_WAIT_MS (default: 120000) — poll GET org for isBootstrapped when job was queued
 *   ORG_TENANT_SELFTEST_CLEANUP=1  — DELETE organization at end (optional)
 *
 * Usage (from repo root):
 *   PLATFORM_OWNER_EMAIL=... PLATFORM_OWNER_PASSWORD=... npm run test:org-tenant-url -w pos-backend
 *
 * Exit code 0 = all executed steps passed; 1 = failure (details on stderr).
 */
require("dotenv").config();

const API_BASE =
  process.env.ORG_TENANT_SELFTEST_API_BASE ||
  process.env.PLATFORM_SELFTEST_BASE_URL ||
  "http://127.0.0.1:8010";
const TENANT_APP_BASE =
  process.env.ORG_TENANT_SELFTEST_TENANT_APP_BASE || "http://localhost:3000";
const SKIP_TENANT_HTTP =
  String(process.env.ORG_TENANT_SELFTEST_SKIP_TENANT_HTTP || "") === "1";
const SKIP_PIN = String(process.env.ORG_TENANT_SELFTEST_SKIP_PIN || "") === "1";
const CLEANUP = String(process.env.ORG_TENANT_SELFTEST_CLEANUP || "") === "1";
const BOOTSTRAP_WAIT_MS = Number(
  process.env.ORG_TENANT_SELFTEST_BOOTSTRAP_WAIT_MS || 120_000,
);

const PLATFORM_EMAIL = process.env.PLATFORM_OWNER_EMAIL || "";
const PLATFORM_PASSWORD = process.env.PLATFORM_OWNER_PASSWORD || "";

/** @type {{ phase: string; ok: boolean; detail?: string; ms?: number }[]} */
const steps = [];

function log(msg) {
  console.log(msg);
}

function fail(phase, message, extra = undefined) {
  steps.push({ phase, ok: false, detail: message });
  console.error(`\n[FAIL] ${phase}: ${message}`);
  if (extra !== undefined) console.error(JSON.stringify(extra, null, 2));
}

function pass(phase, message, ms) {
  steps.push({ phase, ok: true, detail: message, ms });
  console.log(`[ OK ] ${phase}: ${message}${ms != null ? ` (${ms}ms)` : ""}`);
}

function joinUrl(base, path) {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function httpJson(base, method, path, { headers = {}, body, query } = {}) {
  const url = new URL(joinUrl(base, path));
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const h = new Headers(headers);
  if (!h.has("Accept")) h.set("Accept", "application/json");
  /** @type {RequestInit} */
  const init = { method, headers: h };
  if (body !== undefined) {
    if (!h.has("Content-Type")) h.set("Content-Type", "application/json");
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const ms = Date.now() - started;
    const err = e instanceof Error ? e : new Error(String(e));
    const cause = err.cause instanceof Error ? err.cause.message : "";
    throw new Error(
      `Fetch failed ${method} ${url.toString()}: ${err.message}${cause ? ` (${cause})` : ""}. Is the API running at ${API_BASE}?`,
    );
  }
  const ms = Date.now() - started;
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { res, json, ms, url: url.toString() };
}

function platformTokenFrom(json, res) {
  if (json && typeof json.accessToken === "string" && json.accessToken) {
    return json.accessToken;
  }
  const getSetCookie = res.headers.getSetCookie?.bind(res.headers);
  const lines = typeof getSetCookie === "function" ? getSetCookie() : [];
  const prefix = "platformAccessToken=";
  for (const line of lines) {
    if (String(line).startsWith(prefix)) {
      return String(line).slice(prefix.length).split(";")[0] || null;
    }
  }
  return null;
}

async function ensureBootstrapped(token, orgId, bootstrapMode) {
  const fetchOrg = () =>
    httpJson(API_BASE, "GET", `/api/platform/v1/organizations/${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

  if (bootstrapMode !== "queue") {
    const { res, json, ms } = await fetchOrg();
    if (res.ok && json?.success && json?.data?.isBootstrapped === true) {
      pass("bootstrap", `isBootstrapped=true (inline/sync; mode=${bootstrapMode || "sync_fallback"})`, ms);
      return true;
    }
    fail("bootstrap", "Organization exists but isBootstrapped is not true after create (sync path).", {
      status: res.status,
      isBootstrapped: json?.data?.isBootstrapped,
      bootstrapMode,
      hint: "Check orgBootstrapService logs / DB for errors during create.",
    });
    return false;
  }

  const deadline = Date.now() + BOOTSTRAP_WAIT_MS;
  let last = null;
  while (Date.now() < deadline) {
    const { res, json, ms } = await fetchOrg();
    last = { status: res.status, isBootstrapped: json?.data?.isBootstrapped, ms };
    if (res.ok && json?.success && json?.data?.isBootstrapped === true) {
      pass("bootstrap", `isBootstrapped=true after queue (waited ≤ ${BOOTSTRAP_WAIT_MS}ms)`, ms);
      return true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  fail(
    "bootstrap",
    `Organization not bootstrapped after ${BOOTSTRAP_WAIT_MS}ms (bootstrapMode was "queue").`,
    {
      hint: "Start Redis + worker: REDIS_URL=... npm run worker:platform",
      last,
    },
  );
  return false;
}

async function checkTenantAppRedirect(slug) {
  const entry = joinUrl(TENANT_APP_BASE, `/?org=${encodeURIComponent(slug)}`);
  const started = Date.now();
  let res;
  try {
    res = await fetch(entry, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "text/html,*/*" },
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    fail("tenant-http", `Could not reach tenant app`, {
      entry,
      message: err.message,
      hint: `Start pos-frontend2 (e.g. npm run dev) or set ORG_TENANT_SELFTEST_TENANT_APP_BASE / SKIP_TENANT_HTTP=1`,
    });
    return false;
  }
  const ms = Date.now() - started;
  const loc = res.headers.get("Location") || "";

  if (res.status >= 300 && res.status < 400) {
    const ok =
      loc.includes("/login") &&
      (loc.includes(`org=${encodeURIComponent(slug)}`) || loc.includes(`org=${slug}`));
    if (ok) {
      pass("tenant-http", `Redirect ${res.status} to login with org (${entry})`, ms);
      return true;
    }
    fail(
      "tenant-http",
      `Unexpected Location for tenant entry URL`,
      { entry, status: res.status, location: loc, expectedSlug: slug },
    );
    return false;
  }

  if (res.status === 200) {
    pass("tenant-http", `200 OK at entry (no redirect) — verify app route (${entry})`, ms);
    return true;
  }

  fail("tenant-http", `Unexpected status for tenant entry URL`, {
    entry,
    status: res.status,
    location: loc || null,
  });
  return false;
}

async function main() {
  log("═".repeat(72));
  log("Organization + tenant URL self-test");
  log(`  API base:        ${API_BASE}`);
  log(`  Tenant app base: ${TENANT_APP_BASE}${SKIP_TENANT_HTTP ? " (HTTP checks skipped)" : ""}`);
  log("═".repeat(72));

  if (!PLATFORM_EMAIL || !PLATFORM_PASSWORD) {
    fail(
      "config",
      "PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD must be set (see apps/pos-backend/.env.example).",
    );
    process.exit(1);
  }

  const t0 = Date.now();

  try {
    const { res, json, ms } = await httpJson(API_BASE, "GET", "/health");
    if (res.ok && json?.ok) pass("health", `GET /health`, ms);
    else fail("health", "GET /health did not return { ok: true }", { status: res.status, json });
  } catch (e) {
    fail("health", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  let platformToken = null;
  {
    const { res, json, ms } = await httpJson(API_BASE, "POST", "/api/platform/v1/auth/login", {
      body: { email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD },
    });
    platformToken = platformTokenFrom(json, res);
    if (res.ok && platformToken) pass("platform-auth", "Platform login", ms);
    else {
      fail("platform-auth", "Platform login failed", {
        status: res.status,
        message: json?.message,
        hasToken: !!platformToken,
      });
      process.exit(1);
    }
  }

  const slug = `org-smoke-${Date.now()}`;
  const idemKey = `org-tenant-selftest-${slug}`;
  let orgId = null;
  let bootstrapMode = null;

  {
    const { res, json, ms } = await httpJson(API_BASE, "POST", "/api/platform/v1/organizations", {
      headers: {
        Authorization: `Bearer ${platformToken}`,
        "Idempotency-Key": idemKey,
      },
      body: {
        name: `Selftest ${slug}`,
        slug,
        planKey: "standard",
        ownerEmail: `owner-${slug}@test.local`,
        ownerName: "Selftest Owner",
      },
    });
    bootstrapMode = json?.bootstrapMode ?? null;
    orgId = json?.data?._id ? String(json.data._id) : null;

    if (res.status === 201 && json?.success && orgId) {
      pass(
        "org-create",
        `POST /organizations (bootstrapMode=${bootstrapMode || "unknown"})`,
        ms,
      );
    } else {
      fail("org-create", "POST /organizations failed", {
        status: res.status,
        body: json,
      });
      process.exit(1);
    }
  }

  {
    const { res, json, ms } = await httpJson(API_BASE, "GET", `/api/platform/v1/organizations/${orgId}`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (res.ok && json?.success && json?.data?.slug === slug) {
      pass("org-read", `GET /organizations/:id slug=${slug}`, ms);
    } else {
      fail("org-read", "GET /organizations/:id failed or slug mismatch", {
        status: res.status,
        body: json,
      });
      process.exit(1);
    }
  }

  const bootOk = await ensureBootstrapped(platformToken, orgId, bootstrapMode);
  if (!bootOk) process.exit(1);

  /** @type {string | null} */
  let adminPinFromOrg = null;
  {
    const { res, json, ms } = await httpJson(API_BASE, "GET", `/api/platform/v1/organizations/${orgId}`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    const creds = json?.data?.defaultCredentials;
    const adminRow = Array.isArray(creds) ? creds.find((c) => c && String(c.role) === "admin") : null;
    const pin = adminRow && typeof adminRow.pin === "string" ? adminRow.pin.trim() : "";
    if (res.ok && json?.success && pin) {
      adminPinFromOrg = pin;
      pass("org-credentials", `GET /organizations/:id has defaultCredentials.admin.pin`, ms);
    } else {
      fail("org-credentials", "Bootstrapped org missing defaultCredentials or admin PIN — cannot verify tenant login", {
        status: res.status,
        hasCreds: Array.isArray(creds),
        body: json,
      });
      process.exit(1);
    }
  }

  if (!SKIP_TENANT_HTTP) {
    const ok = await checkTenantAppRedirect(slug);
    if (!ok) process.exit(1);
  } else {
    pass("tenant-http", "skipped (ORG_TENANT_SELFTEST_SKIP_TENANT_HTTP=1)", null);
  }

  if (!SKIP_PIN && adminPinFromOrg) {
    const { res, json, ms } = await httpJson(API_BASE, "POST", "/api/auth/login", {
      body: { pin: String(adminPinFromOrg) },
    });
    if (res.ok && json?.success) {
      pass("tenant-pin", `POST /api/auth/login with provisioned PIN`, ms);
      const access = json?.accessToken;
      if (access) {
        const s = await httpJson(API_BASE, "GET", "/api/auth/session", {
          headers: { Authorization: `Bearer ${access}` },
        });
        if (s.res.ok && s.json?.authenticated === true && s.json?.data) {
          pass("tenant-session", "GET /api/auth/session authenticated after PIN login", s.ms);
        } else {
          fail("tenant-session", "GET /api/auth/session not authenticated after PIN login", s.json);
          process.exit(1);
        }
      } else {
        fail("tenant-session", "Login succeeded but response had no accessToken; cannot probe session");
        process.exit(1);
      }
    } else {
      fail("tenant-pin", "PIN login failed for provisioned admin", {
        status: res.status,
        message: json?.message,
        body: json,
      });
      process.exit(1);
    }
  } else if (SKIP_PIN) {
    pass("tenant-pin", "skipped (ORG_TENANT_SELFTEST_SKIP_PIN=1)", null);
  } else {
    fail("tenant-pin", "No admin PIN from org defaultCredentials — cannot verify tenant login");
    process.exit(1);
  }

  if (CLEANUP && orgId) {
    const { res, json, ms } = await httpJson(API_BASE, "DELETE", `/api/platform/v1/organizations/${orgId}`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (res.ok && json?.success) pass("cleanup", `DELETE /organizations/:id`, ms);
    else fail("cleanup", "DELETE organization failed", { status: res.status, json });
  }

  const total = Date.now() - t0;
  log("\n" + "─".repeat(72));
  log(`Summary: ${steps.filter((s) => s.ok).length}/${steps.length} steps OK in ${total}ms`);
  log(
    JSON.stringify(
      {
        slug,
        orgId,
        bootstrapMode,
        tenantEntryUrl: joinUrl(TENANT_APP_BASE, `/?org=${encodeURIComponent(slug)}`),
        steps,
      },
      null,
      2,
    ),
  );
  log("─".repeat(72));

  if (steps.some((s) => !s.ok)) process.exit(1);
  log("Result: PASS\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
