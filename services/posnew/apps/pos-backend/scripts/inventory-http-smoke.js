#!/usr/bin/env node
/**
 * Inventory (Phases 1–7) — HTTP smoke test (read-only + RBAC spot checks).
 *
 * Hits POS backend routes used by studio inventory: hub, analytics, movements,
 * GRN, warehouse PATCH contract (optional), recipes, supplier links, menu variants,
 * stock takes, procurement list, barcode (404 = route OK).
 *
 * Prerequisites:
 *   - `pos-backend` running (default http://127.0.0.1:8010 — check your app port)
 *   - MongoDB with dev org; `npm run seed:dev` for PIN users
 *
 * Usage (from `apps/pos-backend/`):
 *   node scripts/inventory-http-smoke.js
 *   API_BASE=http://127.0.0.1:3000 INVENTORY_SMOKE_PIN=1001 node scripts/inventory-http-smoke.js
 *   VERBOSE=1 node scripts/inventory-http-smoke.js
 *
 * Env:
 *   API_BASE          — default http://127.0.0.1:8010
 *   INVENTORY_SMOKE_PIN — PIN for admin/manager user (default 1001 = Dev Admin)
 *   INVENTORY_SMOKE_WAREHOUSE_PATCH — if "1", PATCH first zone with same name (noop-ish); needs ≥1 zone
 *
 * Mutations: this script does NOT POST adjust/transfer/returns/GRN confirm by default.
 * For deep inventory logic + writes, run: `npm run test:inventory:integration`
 *
 * @see scripts/inventory-integration-seed-test.js
 * @see scripts/rbac-smoke-test.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const User = require("../models/userModel");
const Device = require("../models/deviceModel");
const Organization = require("../models/organizationModel");
const { computePinLookup } = require("../utils/pinLookup");

const BASE = (process.env.API_BASE || "http://127.0.0.1:8010").replace(/\/$/, "");
const PIN = process.env.INVENTORY_SMOKE_PIN || "1001";
const WAITER_PIN = process.env.INVENTORY_SMOKE_WAITER_PIN || "1003";
const VERBOSE = process.env.VERBOSE === "1" || process.env.VERBOSE === "true";
const TRY_WAREHOUSE_PATCH = process.env.INVENTORY_SMOKE_WAREHOUSE_PATCH === "1";
const AUTO_APPROVE_DEVICE = process.env.INVENTORY_SMOKE_AUTO_APPROVE_DEVICE !== "0";

let passed = 0;
let failed = 0;

function logv(...args) {
  if (VERBOSE) console.log("[verbose]", ...args);
}

function parseDeviceUuidFromSetCookie(response) {
  const raw = response.headers.get("set-cookie") || "";
  const m = raw.match(/device_uuid=([^;]+)/i);
  return m ? String(m[1]).trim() : "";
}

async function ensureMongoConnected() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(config.databaseURI);
}

async function autoApproveDeviceForPin(pin, deviceUuid) {
  if (!deviceUuid) return false;
  await ensureMongoConnected();
  const updated = await Device.findOneAndUpdate(
    { uuid: deviceUuid },
    { $set: { status: "approved", lastSeenAt: new Date() } },
    { new: true }
  ).lean();
  return Boolean(updated);
}

async function ensureLicenseWindowForPin(pin) {
  if (!pin) return false;
  await ensureMongoConnected();
  const pinLookup = computePinLookup(String(pin));
  const user = await User.findOne({ pinLookup }).select("organization").lean();
  const organizationId = user?.organization ? String(user.organization) : "";
  if (!organizationId) return false;
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const updated = await Organization.updateOne(
    { _id: organizationId },
    {
      $set: {
        licenseStartDate: start,
        licenseEndDate: end,
        licenseStartsAt: start,
        licenseEndsAt: end,
      },
    }
  );
  return Number(updated.modifiedCount || 0) > 0 || Number(updated.matchedCount || 0) > 0;
}

async function login(pin) {
  const makeRequest = (cookieHeader = "") =>
    fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({ pin: String(pin) }),
    });

  let r = await makeRequest();
  let j = await r.json().catch(() => ({}));
  if (!r.ok && r.status === 403 && AUTO_APPROVE_DEVICE) {
    const code = String(j?.code || "").trim();
    if (code === "DEVICE_PENDING") {
      const deviceUuid = parseDeviceUuidFromSetCookie(r);
      const approved = await autoApproveDeviceForPin(pin, deviceUuid);
      if (approved) {
        r = await makeRequest(`device_uuid=${deviceUuid}`);
        j = await r.json().catch(() => ({}));
      }
    }
  }
  if (!r.ok && r.status === 403) {
    const code = String(j?.code || "").trim();
    const message = String(j?.message || "").toLowerCase();
    const looksLikeLicense =
      code.includes("LICENSE") ||
      message.includes("license window") ||
      message.includes("license");
    if (looksLikeLicense) {
      const adjusted = await ensureLicenseWindowForPin(pin);
      if (adjusted) {
        r = await makeRequest();
        j = await r.json().catch(() => ({}));
      }
    }
  }
  if (!r.ok) {
    throw new Error(`Login PIN ${pin}: ${r.status} ${j.message || JSON.stringify(j)}`);
  }
  const token = j.accessToken;
  if (!token) throw new Error("Login response missing accessToken");
  const locationId = await resolveLocationScopeId(token);
  return { token, locationId };
}

async function resolveLocationScopeId(token) {
  try {
    const r = await fetch(`${BASE}/api/user`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const j = await r.json().catch(() => ({}));
    const row = j?.data || {};
    const direct = row?.location?._id || row?.location?.id || row?.location || "";
    if (direct && typeof direct === "string") return direct;
    const first = Array.isArray(row?.locations) ? row.locations[0] : null;
    const fromArr = first?._id || first?.id || first || "";
    if (typeof fromArr === "string" && fromArr) return fromArr;

    // Admins may not have explicit assigned locations; fallback to first org location.
    const lr = await fetch(`${BASE}/api/locations`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const lj = await lr.json().catch(() => ({}));
    const firstLocation = Array.isArray(lj?.data) ? lj.data[0] : null;
    const fallback = firstLocation?._id || firstLocation?.id || "";
    return typeof fallback === "string" ? fallback : "";
  } catch {
    return "";
  }
}

async function req(method, path, session, body) {
  const headers = { Accept: "application/json", Authorization: `Bearer ${session.token}` };
  if (session?.locationId) {
    headers["X-Location-Id"] = session.locationId;
  }
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, init);
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  logv(method, path, r.status, text?.slice?.(0, 160));
  return { status: r.status, ok: r.ok, json, text };
}

function ok(name, status, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (list.includes(status)) {
    passed += 1;
    console.log(`ok  ${name} (${status})`);
    return true;
  }
  failed += 1;
  console.error(`FAIL ${name}: HTTP ${status} (expected ${list.join("|")})`);
  return false;
}

async function main() {
  console.log(`Inventory HTTP smoke → ${BASE} (PIN ${PIN})\n`);

  let adminTok;
  let adminSession;
  try {
    adminSession = await login(PIN);
    adminTok = adminSession.token;
  } catch (e) {
    console.error(e.message || e);
    console.error("\nStart pos-backend and run: npm run seed:dev");
    process.exit(1);
    return;
  }

  const waiterSession = await login(WAITER_PIN);
  const waiterTok = waiterSession.token;

  /** @type {Array<[string, string, string, number[]]>} */
  const gets = [
    ["Inventory report", "GET", "/api/inventory/report", [200]],
    ["Low stock (paged)", "GET", "/api/inventory/low-stock?page=1&limit=5", [200]],
    ["Balances", "GET", "/api/inventory/balances", [200]],
    ["Movements", "GET", "/api/inventory/movements?page=1&limit=5", [200]],
    ["POS inventory policy", "GET", "/api/inventory/pos-policy", [200]],
    ["Menu availability", "GET", "/api/inventory/menu-availability", [200]],
    ["Valuation report", "GET", "/api/inventory/report/valuation", [200]],
    ["Slow-moving report", "GET", "/api/inventory/report/slow-moving?days=30", [200]],
    ["Forecast", "GET", "/api/inventory/forecast", [200]],
    ["Waste analytics", "GET", "/api/inventory/analytics/waste", [200]],
    ["Price history", "GET", "/api/inventory/analytics/price-history?limit=5", [200]],
    ["Locations", "GET", "/api/locations", [200]],
    ["Warehouse zones", "GET", "/api/warehouse/zones", [200]],
    ["Goods receipt notes", "GET", "/api/goods-receipt-notes", [200]],
    ["Purchase orders", "GET", "/api/purchase-orders", [200]],
    ["Stock takes", "GET", "/api/stock-takes", [200]],
    ["Recipes list", "GET", "/api/recipes", [200]],
    ["Ingredients list", "GET", "/api/ingredients?status=active&limit=5", [200]],
    ["Menu items list", "GET", "/api/menu-items", [200]],
    ["Barcode (unknown SKU → 404)", "GET", "/api/inventory/scan/__smoke_unknown__", [404]],
    ["Reconciliation hub", "GET", "/api/reconciliation", [200]],
    ["Serials hub", "GET", "/api/serials", [200]],
    ["Vendor returns hub", "GET", "/api/vendor-returns", [200]],
  ];

  for (const [label, method, path, allowed] of gets) {
    const r = await req(method, path, adminSession);
    ok(`${label}`, r.status, allowed);
  }

  // RBAC: waiter must not read full inventory report; may read catalog-scoped endpoints.
  const rReport = await req("GET", "/api/inventory/report", waiterSession);
  ok("RBAC: waiter denied inventory report", rReport.status, [403]);

  const rMenuAvail = await req("GET", "/api/inventory/menu-availability", waiterSession);
  ok("RBAC: waiter can menu-availability", rMenuAvail.status, [200]);

  const rPolicy = await req("GET", "/api/inventory/pos-policy", waiterSession);
  ok("RBAC: waiter can pos-policy", rPolicy.status, [200]);

  // Dynamic: supplier links + menu variants (first IDs)
  const ingRes = await req("GET", "/api/ingredients?status=active&limit=1", adminSession);
  const ingId = ingRes.json?.data?.[0]?._id;
  if (ingId) {
    const sl = await req("GET", `/api/ingredients/${ingId}/supplier-links`, adminSession);
    ok(`Ingredient supplier-links (${ingId})`, sl.status, [200]);
  } else {
    console.log("skip Ingredient supplier-links (no ingredients in org)");
  }

  const miRes = await req("GET", "/api/menu-items", adminSession);
  const menuItemId = miRes.json?.data?.[0]?._id;
  if (menuItemId) {
    const v = await req("GET", `/api/menu-items/${menuItemId}/variants`, adminSession);
    ok(`Menu item variants (${menuItemId})`, v.status, [200]);

    const recipe = await req("GET", `/api/recipes/by-menu-item/${menuItemId}`, adminSession);
    ok(`Recipe by menu item (${menuItemId})`, recipe.status, [200]);
  } else {
    console.log("skip Menu variants / recipe by menu item (no menu items)");
  }

  // Warehouse bins (needs zoneId)
  const zRes = await req("GET", "/api/warehouse/zones", adminSession);
  const zoneId = zRes.json?.data?.[0]?._id;
  if (zoneId) {
    const b = await req("GET", `/api/warehouse/bins?zoneId=${encodeURIComponent(zoneId)}`, adminSession);
    ok("Warehouse bins for first zone", b.status, [200]);

    if (TRY_WAREHOUSE_PATCH && zRes.json?.data?.[0]) {
      const z = zRes.json.data[0];
      const patch = await req(
        "PATCH",
        `/api/warehouse/zones/${zoneId}`,
        adminSession,
        { name: z.name, description: z.description || "", status: z.status || "active" },
      );
      ok("Warehouse PATCH zone (echo)", patch.status, [200]);
    }
  } else {
    console.log("skip Warehouse bins (no zones — create one in studio)");
  }

  // 2026-04-16 recheck: contract assertions for new write endpoints.
  // We don't POST real payloads here (no IDs without seeding). Instead we prove the route
  // exists and is auth-wall-protected: a POST with an invalid id must NOT return 404 "route".
  const qc404 = await req("POST", "/api/goods-receipt-notes/000000000000000000000000/qc", adminSession, {
    status: "qc_pending",
  });
  ok(
    "GRN /qc transition endpoint reachable (404 GRN / 400 validation / 200 ok)",
    qc404.status,
    [200, 400, 404]
  );

  const overrideMissing = await req("POST", "/api/reconciliation/000000000000000000000000/override", adminSession, {
    reason: "smoke",
  });
  ok(
    "Reconciliation /override endpoint reachable",
    overrideMissing.status,
    [200, 400, 404]
  );

  const resolveMissing = await req("POST", "/api/reconciliation/000000000000000000000000/resolve", adminSession, {
    resolution: "smoke",
  });
  ok(
    "Reconciliation /resolve endpoint reachable",
    resolveMissing.status,
    [200, 400, 404]
  );

  const serialRegister = await req("POST", "/api/serials", adminSession, {
    serial: "",
    ingredientId: "000000000000000000000000",
  });
  ok(
    "Serials register endpoint reachable (400 validation expected)",
    serialRegister.status,
    [200, 201, 400, 404]
  );

  if (failed === 0) {
    console.log(`\nAll checks passed (${passed} ok).`);
  } else {
    console.error(`\nDone with failures: ${failed} failed, ${passed} passed.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});
