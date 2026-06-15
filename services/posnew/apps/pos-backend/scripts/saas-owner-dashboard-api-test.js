#!/usr/bin/env node
/**
 * Integration test: every HTTP surface used by apps/saas-dash (platform / SaaS owner UI).
 *
 * Prerequisites
 * ---------------
 * - API running (default http://127.0.0.1:8010) with MongoDB + PLATFORM_JWT_SECRET (+ refresh secret) configured.
 * - Platform owner account (see below).
 *
 * Environment
 * -------------
 *   PLATFORM_DASHBOARD_TEST_BASE_URL   API origin (default http://127.0.0.1:8010)
 *   PLATFORM_OWNER_EMAIL               Login email (required for authenticated checks)
 *   PLATFORM_OWNER_PASSWORD            Login password (required)
 *
 * Flags
 * -----
 *   --seed-owner          Run scripts/seedPlatformOwner.js first (uses same env vars).
 *   --include-refresh     POST /auth/refresh using cookie / body refresh token after login.
 *   --include-safe-posts  Run low-risk POSTs (mark-all-read); still no org delete / compliance.
 *   --json                Print a JSON summary as the last line (for CI).
 *
 * Optional fixtures (notifications list / unread):
 *   npm run seed:platform-fixtures
 *
 * Example
 * -------
 *   cd apps/pos-backend
 *   export PLATFORM_OWNER_EMAIL=owner@example.com PLATFORM_OWNER_PASSWORD='your-secret'
 *   npm run seed:platform-owner
 *   npm run seed:platform-fixtures
 *   # start API in another terminal, then:
 *   node scripts/saas-owner-dashboard-api-test.js
 */
require("dotenv").config();
const { spawnSync } = require("child_process");
const path = require("path");

const BASE =
  process.env.PLATFORM_DASHBOARD_TEST_BASE_URL ||
  process.env.PLATFORM_SELFTEST_BASE_URL ||
  "http://127.0.0.1:8010";
const PREFIX = "/api/platform/v1";

const args = new Set(process.argv.slice(2));
const WANT_JSON = args.has("--json");
const SEED_OWNER = args.has("--seed-owner");
const INCLUDE_REFRESH = args.has("--include-refresh");
const INCLUDE_SAFE_POSTS = args.has("--include-safe-posts");

function extractCookieValue(setCookieHeaders, cookieName) {
  if (!setCookieHeaders || !setCookieHeaders.length) return null;
  const prefix = `${cookieName}=`;
  for (const line of setCookieHeaders) {
    if (String(line).startsWith(prefix)) {
      return String(line).slice(prefix.length).split(";")[0] || null;
    }
  }
  return null;
}

function getSetCookieArray(res) {
  if (typeof res.headers.getSetCookie === "function") {
    return res.headers.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  if (!single) return [];
  return [single];
}

async function http(method, relPath, { headers = {}, body, query } = {}) {
  const u = new URL(relPath.startsWith("http") ? relPath : `${BASE}${relPath}`);
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    }
  }
  const h = new Headers(headers);
  if (body !== undefined && !h.has("Content-Type")) {
    h.set("Content-Type", "application/json");
  }
  let res;
  try {
    res = await fetch(u, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error(
      `Fetch failed for ${method} ${u.href}: ${e.cause?.message || e.message}. Is the API running at ${BASE}?`,
    );
    err.cause = e;
    throw err;
  }
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { _raw: text };
    }
  }
  return { res, json, text };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function dateRangeLastDays(days) {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - days);
  return { from: isoDate(from), to: isoDate(to) };
}

function successShape(json) {
  if (!json || typeof json !== "object") return false;
  if (json.ok === true) return true;
  if (json.success === true) return true;
  if (typeof json.count === "number" && json.success === true) return true;
  return false;
}

async function main() {
  const email = process.env.PLATFORM_OWNER_EMAIL;
  const password = process.env.PLATFORM_OWNER_PASSWORD;
  if (!email || !password) {
    console.error(
      "Set PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD (same vars as npm run seed:platform-owner).",
    );
    process.exit(1);
  }

  if (SEED_OWNER) {
    const r = spawnSync(process.execPath, [path.join(__dirname, "seedPlatformOwner.js")], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
      env: process.env,
    });
    if (r.status !== 0) {
      console.error("seedPlatformOwner.js exited with code", r.status);
      process.exit(1);
    }
  }

  const rows = [];
  const failures = [];
  const warnings = [];

  const record = (name, method, pathStr, { res, json }, note) => {
    const ok =
      res.ok &&
      (note === "allow_empty"
        ? true
        : successShape(json) || res.status === 204);
    const line = {
      ok,
      status: res.status,
      method,
      path: pathStr,
      name,
      note: note || "",
    };
    rows.push(line);
    const flag = ok ? "OK " : "FAIL";
    if (!WANT_JSON) {
      console.log(
        `${flag}  ${String(res.status).padStart(3)}  ${method.padEnd(6)}  ${pathStr}${note ? `  (${note})` : ""}`,
      );
    }
    if (!ok) failures.push(line);
    return ok;
  };

  // --- Public / health ---
  {
    const h = await http("GET", "/health");
    record("health", "GET", "/health", h, "");
  }
  {
    const r = await http("GET", "/ready");
    if (!r.res.ok) warnings.push("/ready not OK (Redis optional in dev)");
    if (!WANT_JSON) console.log(`${r.res.ok ? "OK " : "WARN"}  ${r.res.status}  GET    /ready`);
  }
  {
    const o = await http("GET", `${PREFIX}/openapi.json`);
    const ok = o.res.ok && o.json && (o.json.openapi || o.json.paths);
    rows.push({ ok, status: o.res.status, method: "GET", path: `${PREFIX}/openapi.json`, name: "openapi" });
    if (!WANT_JSON) console.log(`${ok ? "OK " : "FAIL"}  ${o.res.status}  GET    ${PREFIX}/openapi.json`);
    if (!ok) failures.push({ name: "openapi" });
  }

  const login = await http("POST", `${PREFIX}/auth/login`, {
    body: { email, password },
  });
  const cookies = getSetCookieArray(login.res);
  const accessToken = extractCookieValue(cookies, "platformAccessToken");
  const refreshToken = extractCookieValue(cookies, "platformRefreshToken");

  if (!login.res.ok || !accessToken) {
    console.error("Login failed:", login.res.status, login.json || login.text);
    process.exit(1);
  }
  if (!WANT_JSON) console.log(`OK   ${login.res.status}  POST   ${PREFIX}/auth/login`);

  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const run = async (name, method, pathStr, opts = {}) => {
    const r = await http(method, pathStr, { ...opts, headers: { ...authHeader, ...opts.headers } });
    const note = "";
    const soft503 = opts.soft503 && r.res.status === 503;
    if (soft503) {
      warnings.push(`${method} ${pathStr} -> 503 (optional dependency)`);
      if (!WANT_JSON) console.log(`WARN ${r.res.status}  ${method.padEnd(6)}  ${pathStr}  (optional)`);
      rows.push({ ok: true, status: r.res.status, method, path: pathStr, name, note: "soft503" });
      return r;
    }
    record(name, method, pathStr, r, note);
    return r;
  };

  await run("auth_me", "GET", `${PREFIX}/auth/me`);

  const { from, to } = dateRangeLastDays(30);
  await run("metrics_summary", "GET", `${PREFIX}/metrics/summary`);
  await run("metrics_kpis", "GET", `${PREFIX}/metrics/kpis`, { query: { from, to } });
  await run("metrics_analytics", "GET", `${PREFIX}/metrics/analytics`, { query: { from, to } });

  const orgs = await run("organizations_list", "GET", `${PREFIX}/organizations`, { query: { limit: 20 } });
  let firstOrgId = null;
  if (orgs.json?.data?.length) {
    firstOrgId = String(orgs.json.data[0]._id);
    await run("organization_detail", "GET", `${PREFIX}/organizations/${firstOrgId}`);
  }

  await run("audits", "GET", `${PREFIX}/audits`, {
    query: firstOrgId ? { organizationId: firstOrgId, limit: 10 } : { limit: 10 },
  });

  await run("webhooks_endpoints", "GET", `${PREFIX}/webhooks/endpoints`);
  await run("webhooks_outbox", "GET", `${PREFIX}/webhooks/outbox`, { query: { limit: 10 } });

  await run("jobs_list", "GET", `${PREFIX}/jobs`, { query: { limit: 20 }, soft503: true });


  const usersList = await run("users_global", "GET", `${PREFIX}/users/global`, { query: { limit: 20 } });
  const firstUserId = usersList.json?.data?.users?.[0]?._id;
  if (firstUserId) {
    await run("users_global_detail", "GET", `${PREFIX}/users/global/${firstUserId}`);
  }

  await run("notifications", "GET", `${PREFIX}/notifications`);
  await run("notifications_unread", "GET", `${PREFIX}/notifications/unread-count`);

  await run("inventory_low_stock", "GET", `${PREFIX}/inventory/low-stock`);
  await run("inventory_slow", "GET", `${PREFIX}/inventory/slow-moving`);
  await run("inventory_movements", "GET", `${PREFIX}/inventory/movements`, { query: { limit: 100 } });

  await run("system_settings", "GET", `${PREFIX}/system-settings`);

  await run("flags_list", "GET", `${PREFIX}/flags`);
  await run("flags_evaluate", "GET", `${PREFIX}/flags/evaluate`, { query: { key: "dashboard_api_test" } });

  await run("api_keys_list", "GET", `${PREFIX}/auth/api-keys`);

  if (INCLUDE_REFRESH && refreshToken) {
    const ref = await http("POST", `${PREFIX}/auth/refresh`, {
      headers: { "X-Refresh-Token": refreshToken },
      body: {},
    });
    record("auth_refresh", "POST", `${PREFIX}/auth/refresh`, ref, "");
  }

  if (INCLUDE_SAFE_POSTS) {
    const pr = await http("POST", `${PREFIX}/notifications/all/read`, { headers: authHeader, body: {} });
    record("notifications_mark_all_read", "POST", `${PREFIX}/notifications/all/read`, pr, "");
  }

  const failCount = failures.length;
  if (WANT_JSON) {
    console.log(
      JSON.stringify({
        baseUrl: BASE,
        failures,
        warnings,
        failCount,
        rows,
      }),
    );
  } else {
    if (warnings.length) {
      console.log("\nWarnings:");
      for (const w of warnings) console.log(`  - ${w}`);
    }
    console.log(failCount ? `\nDone with ${failCount} failure(s).` : "\nAll dashboard API checks passed.");
  }

  process.exit(failCount ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
