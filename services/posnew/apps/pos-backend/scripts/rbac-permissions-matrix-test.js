#!/usr/bin/env node
/* global console, fetch, process */
/**
 * RBAC permissions matrix — HTTP probes × seeded staff roles + catalog/me checks.
 *
 * Predictions use **default** built-in roles only (`builtinOverrides` / custom roles in DB
 * are ignored unless you extend this script to load them). If your org overrides RBAC in
 * MongoDB, some rows may mismatch — re-run after reset or treat mismatches as signals.
 *
 * Prerequisites: API + MongoDB, dev staff seed (`npm run seed:dev` in pos-backend).
 * Local Mongo (when Atlas SRV fails): `MONGODB_URI=mongodb://127.0.0.1:27017/posdev npm run seed:dev`
 *
 * PIN login + device gate: the API may return 403 "device is not authorized". The script forwards
 * `Set-Cookie` (e.g. device_uuid) on subsequent PIN attempts. Approve the device in the back office,
 * or bypass login by passing JWTs from an already-approved browser session:
 *
 *   RBAC_MATRIX_BEARERS_JSON='{"admin":"ey...","manager":"ey...","waiter":"ey...","cashier":"ey...","kitchen":"ey...","hostess":"ey..."}' \\
 *     API_BASE=http://127.0.0.1:8010 node scripts/rbac-permissions-matrix-test.js
 *
 *   API_BASE=http://127.0.0.1:8010 node scripts/rbac-permissions-matrix-test.js
 *   API_BASE=http://127.0.0.1:8010 VERBOSE=1 node scripts/rbac-permissions-matrix-test.js
 *
 * PINs: admin 1001, manager 1002, waiter 1003, cashier 1004, kitchen 1005, hostess 1006
 */
const BASE = process.env.API_BASE || "http://127.0.0.1:8010";
const VERBOSE = process.env.VERBOSE === "1" || process.env.VERBOSE === "true";

const rbacPkg = require("@rbac/rbac");
const RBAC = rbacPkg.default || rbacPkg;
const defaultRbacRoles = require("../constants/defaultRbacRoles");
const { PERMISSIONS, BUILTIN_ROLE_KEYS } = require("../constants/permissionsCatalog");

/**
 * Same shape as {@link ../services/rbacService.js} `buildRolesFromConfigDoc` without loading Mongoose.
 * @param {{ builtinOverrides?: object; customRoles?: unknown[] }} doc
 */
function buildRolesFromConfigDoc(doc) {
  const roles = {};
  for (const [k, v] of Object.entries(defaultRbacRoles)) {
    roles[k] = {
      can: [...(v.can || [])],
      ...(v.inherits ? { inherits: [...v.inherits] } : {}),
    };
  }
  const overrides = doc?.builtinOverrides;
  if (overrides && typeof overrides === "object") {
    for (const key of BUILTIN_ROLE_KEYS) {
      const o = overrides[key];
      if (o && Array.isArray(o.can)) {
        roles[key] = {
          can: [...o.can],
          ...(o.inherits ? { inherits: [...o.inherits] } : {}),
        };
      }
    }
  }
  const customList = doc?.customRoles;
  if (Array.isArray(customList)) {
    for (const cr of customList) {
      if (!cr || !cr.key) continue;
      const key = String(cr.key).toLowerCase();
      const entry = { can: [...(cr.can || [])] };
      if (
        cr.inheritsFrom &&
        BUILTIN_ROLE_KEYS.includes(String(cr.inheritsFrom).toLowerCase())
      ) {
        entry.inherits = [String(cr.inheritsFrom).toLowerCase()];
      }
      roles[key] = entry;
    }
  }
  return roles;
}

const FAKE_OBJECT_ID = "507f1f77bcf86cd799439011";

/** @type {Record<string, string>} */
const PINS = {
  admin: "1001",
  manager: "1002",
  waiter: "1003",
  cashier: "1004",
  kitchen: "1005",
  hostess: "1006",
};

const ROLE_ORDER = Object.keys(PINS);

/**
 * @param {string} existing
 * @param {{ headers: { getSetCookie?: () => string[]; get: (n: string) => string | null } }} res
 */
function mergeSetCookieIntoHeader(existing, res) {
  const parts = [];
  if (existing) parts.push(existing);
  /** @type {string[]} */
  let lines = [];
  if (typeof res.headers.getSetCookie === "function") {
    lines = res.headers.getSetCookie();
  } else {
    const single = res.headers.get("set-cookie");
    if (single) lines = [single];
  }
  for (const line of lines) {
    const nv = line.split(";")[0].trim();
    if (nv) parts.push(nv);
  }
  return parts.filter(Boolean).join("; ");
}

/**
 * @param {string} pin
 * @param {string} cookieHeader
 * @returns {Promise<{ token: string; cookieHeader: string }>}
 */
async function loginPin(pin, cookieHeader) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ pin: String(pin) }),
  });
  const nextCookies = mergeSetCookieIntoHeader(cookieHeader, r);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const hint =
      r.status === 403 && String(j.message || "").includes("device")
        ? " (device gate: approve device for this org, or set RBAC_MATRIX_BEARERS_JSON — see script header)"
        : "";
    throw new Error(`Login PIN ${pin}: ${r.status} ${j.message || JSON.stringify(j)}${hint}`);
  }
  const token = j.accessToken;
  if (!token) throw new Error("Login response missing accessToken");
  return { token, cookieHeader: nextCookies };
}

/**
 * @returns {Record<string, string> | null}
 */
function loadBearerTokensFromEnv() {
  const raw = process.env.RBAC_MATRIX_BEARERS_JSON;
  if (!raw || !String(raw).trim()) return null;
  try {
    const o = JSON.parse(String(raw));
    if (!o || typeof o !== "object") return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * @param {string} method
 * @param {string} path
 * @param {string} token
 * @param {unknown} [body]
 * @param {string} [cookieHeader]
 * @returns {Promise<number>}
 */
async function req(method, path, token, body, cookieHeader) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (cookieHeader) headers.Cookie = cookieHeader;
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, init);
  return r.status;
}

/**
 * RBAC engine from code defaults (empty DB overrides).
 * @param {string} roleKey
 * @param {string} operation
 */
function makeCan() {
  const roles = buildRolesFromConfigDoc({
    builtinOverrides: {},
    customRoles: [],
    updatedAt: new Date(0),
  });
  const rbac = RBAC({ enableLogger: false })(roles);
  return (roleKey, operation) => rbac.can(String(roleKey || "").toLowerCase(), operation);
}

/**
 * @param {string} role
 * @param {(op: string) => boolean} can
 * @param {{ jobTitles?: string[]; anyOf?: string[] }} spec
 * @returns {boolean} true => HTTP should be 403
 */
function shouldBe403FromJobOrAnyPerm(role, can, spec) {
  if (spec.jobTitles && spec.jobTitles.includes(role)) return false;
  if (spec.anyOf && spec.anyOf.some((op) => can(op))) return false;
  return true;
}

/**
 * @param {string} role
 * @param {(op: string) => boolean} can
 * @param {{ extraAnyOf: string[] }} spec
 */
function shouldBe403StaffAndAny(role, can, spec) {
  const staffOk =
    role === "admin" || role === "manager" || can("backoffice.*");
  const extraOk = spec.extraAnyOf.some((op) => can(op));
  return !(staffOk && extraOk);
}

/** @type {Array<{ id: string; method: string; path: string; body?: unknown; predict403: (role: string, can: (op: string) => boolean) => boolean }>} */
const HTTP_PROBES = [
  {
    id: "rbac-me",
    method: "GET",
    path: "/api/rbac/me",
    predict403: () => false,
  },
  {
    id: "rbac-catalog",
    method: "GET",
    path: "/api/rbac/catalog",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        jobTitles: ["admin"],
        anyOf: ["admin.rbac.manage"],
      }),
  },
  {
    id: "rbac-config-get",
    method: "GET",
    path: "/api/rbac/config",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        jobTitles: ["admin"],
        anyOf: ["admin.rbac.manage"],
      }),
  },
  {
    id: "config-tax",
    method: "GET",
    path: "/api/config/tax",
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.config.read"] }),
  },
  {
    id: "categories-list",
    method: "GET",
    path: "/api/categories",
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.catalog.read"] }),
  },
  {
    id: "menu-items-list",
    method: "GET",
    path: "/api/menu-items",
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.catalog.read"] }),
  },
  {
    id: "tables-list",
    method: "GET",
    path: "/api/tables",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["pos.table.read", "pos.table.read_own"],
      }),
  },
  {
    id: "orders-list-scoped",
    method: "GET",
    path: "/api/orders",
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.order.read"] }),
  },
  {
    id: "orders-kitchen-queue",
    method: "GET",
    path: "/api/orders/kitchen",
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.kitchen.read"] }),
  },
  {
    id: "order-open-for-table",
    method: "GET",
    path: `/api/orders/for-table/${FAKE_OBJECT_ID}`,
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.order.read"] }),
  },
  {
    id: "order-get-by-id",
    method: "GET",
    path: `/api/orders/${FAKE_OBJECT_ID}`,
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.order.read"] }),
  },
  {
    id: "order-delete",
    method: "DELETE",
    path: `/api/orders/${FAKE_OBJECT_ID}`,
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.order.cancel"] }),
  },
  {
    id: "order-transfer",
    method: "PATCH",
    path: `/api/orders/${FAKE_OBJECT_ID}/transfer`,
    body: { toTableId: FAKE_OBJECT_ID },
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.order.transfer"] }),
  },
  {
    id: "order-patch-status",
    method: "PATCH",
    path: `/api/orders/${FAKE_OBJECT_ID}/status`,
    body: { orderStatus: "open" },
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.order.update"] }),
  },
  {
    id: "kitchen-line-status",
    method: "PATCH",
    path: `/api/orders/${FAKE_OBJECT_ID}/items/${FAKE_OBJECT_ID}/status`,
    body: { lineStatus: "ready" },
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.kitchen.write"] }),
  },
  {
    id: "payment-create-order-stub",
    method: "POST",
    path: "/api/payment/create-order",
    body: {},
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.payment.use"] }),
  },
  {
    id: "printers-list",
    method: "GET",
    path: "/api/printers",
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.printer.read"] }),
  },
  {
    id: "loyalty-config",
    method: "GET",
    path: "/api/loyalty/config",
    predict403: (role, can) => shouldBe403FromJobOrAnyPerm(role, can, { anyOf: ["pos.loyalty.use"] }),
  },
  {
    id: "locations-list",
    method: "GET",
    path: "/api/locations",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: [
          "backoffice.*",
          "backoffice.location.read",
          "pos.table.read",
          "pos.table.read_own",
        ],
      }),
  },
  {
    id: "staff-list",
    method: "GET",
    path: "/api/users",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        jobTitles: ["admin", "manager"],
        anyOf: ["backoffice.*"],
      }),
  },
  {
    id: "ingredients-list",
    method: "GET",
    path: "/api/ingredients",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["backoffice.*", "backoffice.inventory.read"],
      }),
  },
  {
    id: "suppliers-list",
    method: "GET",
    path: "/api/suppliers",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["backoffice.*", "backoffice.inventory.read"],
      }),
  },
  {
    id: "supplier-create-deny-or-validate",
    method: "POST",
    path: "/api/suppliers",
    body: { name: "__rbac_matrix_test__" },
    predict403: (role, can) =>
      shouldBe403StaffAndAny(role, can, {
        extraAnyOf: ["backoffice.suppliers.manage", "backoffice.*"],
      }),
  },
  {
    id: "accounting-accounts",
    method: "GET",
    path: "/api/accounting/accounts",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["backoffice.*", "backoffice.accounting.*", "backoffice.accounting.read"],
      }),
  },
  {
    id: "accounting-journal-entries",
    method: "GET",
    path: "/api/accounting/journal-entries",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["backoffice.*", "backoffice.accounting.*", "backoffice.accounting.gl.read"],
      }),
  },
  {
    id: "accounting-ar-aging",
    method: "GET",
    path: "/api/accounting/reports/ar-aging",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["backoffice.*", "backoffice.accounting.*", "backoffice.accounting.ar.read"],
      }),
  },
  {
    id: "accounting-ap-supplier-statement",
    method: "GET",
    path: "/api/accounting/reports/supplier-statement",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["backoffice.*", "backoffice.accounting.*", "backoffice.accounting.ap.read"],
      }),
  },
  {
    id: "accounting-bank-statements",
    method: "GET",
    path: "/api/accounting/bank/statements",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["backoffice.*", "backoffice.accounting.*", "backoffice.accounting.bank.read"],
      }),
  },
  {
    id: "accounting-periods-close",
    method: "POST",
    path: "/api/accounting/periods/close",
    body: {},
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["backoffice.*", "backoffice.accounting.*", "backoffice.accounting.periods.write"],
      }),
  },
  {
    id: "accounting-expense-reports",
    method: "GET",
    path: "/api/accounting/expense-reports",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["backoffice.*", "backoffice.accounting.*", "backoffice.accounting.expenses.read"],
      }),
  },
  {
    id: "accounting-approval-requests",
    method: "GET",
    path: "/api/accounting/approval-requests",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["backoffice.*", "backoffice.accounting.*", "backoffice.accounting.approvals.read"],
      }),
  },
  {
    id: "accounting-consolidated-tb",
    method: "GET",
    path: "/api/accounting/reports/consolidated/trial-balance",
    predict403: (role, can) =>
      shouldBe403FromJobOrAnyPerm(role, can, {
        anyOf: ["backoffice.*", "backoffice.accounting.*", "backoffice.accounting.consolidated.read"],
      }),
  },
];

/**
 * @param {number} status
 * @param {boolean} expect403
 */
function outcomeMatches(status, expect403) {
  if (status === 401) return { ok: false, reason: "401 Unauthorized (token/org?)" };
  if (expect403) {
    return status === 403
      ? { ok: true, reason: "403 as predicted" }
      : { ok: false, reason: `expected 403, got ${status}` };
  }
  return status === 403
    ? { ok: false, reason: `unexpected 403` }
    : { ok: true, reason: `non-403 (${status})` };
}

async function runCatalogAlignment(adminToken, cookieHeader) {
  const r = await fetch(`${BASE}/api/rbac/catalog`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${adminToken}`,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  if (r.status !== 200) {
    console.log(`[catalog] GET /api/rbac/catalog -> ${r.status} (skip alignment)`);
    return;
  }
  const apiPerms = Array.isArray(j.data?.permissions) ? j.data.permissions : [];
  const apiIds = new Set(apiPerms.map((p) => p.id));
  const staticIds = new Set(PERMISSIONS.map((p) => p.id));
  const missingOnApi = [...staticIds].filter((id) => !apiIds.has(id));
  const extraOnApi = [...apiIds].filter((id) => !staticIds.has(id));
  console.log("\n== Catalog alignment (static constants vs GET /api/rbac/catalog) ==");
  console.log(`  static count: ${staticIds.size}, API count: ${apiIds.size}`);
  if (missingOnApi.length) console.log(`  MISSING on API: ${missingOnApi.join(", ")}`);
  if (extraOnApi.length) console.log(`  EXTRA on API: ${extraOnApi.join(", ")}`);
  if (!missingOnApi.length && !extraOnApi.length) console.log("  ids match.");
}

async function runRbacMeSanity(tokensByRole, cookieHeader) {
  console.log("\n== /api/rbac/me connectivity ==");
  for (const role of ROLE_ORDER) {
    const tok = tokensByRole[role];
    const r = await fetch(`${BASE}/api/rbac/me`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${tok}`,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });
    const j = await r.json().catch(() => ({}));
    const perms = j.data?.permissions;
    const n = Array.isArray(perms) ? perms.length : 0;
    const ok = r.status === 200 && n > 0;
    console.log(`  ${role}: HTTP ${r.status}, permissions[] length=${n}${ok ? "" : "  ** check **"}`);
    if (VERBOSE && Array.isArray(perms)) {
      console.log(`    sample: ${perms.slice(0, 8).join(", ")}${perms.length > 8 ? ", …" : ""}`);
    }
  }
}

async function main() {
  console.log(`RBAC permissions matrix → ${BASE}`);
  console.log("Predictions: default built-in roles (empty builtinOverrides / no custom roles in model).\n");

  const can = makeCan();
  /** @type {Record<string, string>} */
  const tokensByRole = {};
  /** @type {string} */
  let cookieHeader = "";

  const bearers = loadBearerTokensFromEnv();
  try {
    if (bearers) {
      for (const role of ROLE_ORDER) {
        const t = bearers[role];
        if (!t || typeof t !== "string" || !t.trim()) {
          throw new Error(
            `RBAC_MATRIX_BEARERS_JSON must include a non-empty string for each role: ${ROLE_ORDER.join(", ")}`,
          );
        }
        tokensByRole[role] = t.trim();
      }
      console.log("Using RBAC_MATRIX_BEARERS_JSON (skipping PIN login).\n");
    } else {
      for (const role of ROLE_ORDER) {
        const { token, cookieHeader: next } = await loginPin(PINS[role], cookieHeader);
        tokensByRole[role] = token;
        cookieHeader = next;
      }
    }
  } catch (e) {
    console.error(e.message || e);
    console.error("\nEnsure API is up and dev staff is seeded (npm run seed:dev).");
    console.error(
      "MongoDB: if Atlas SRV fails, use local URI e.g. MONGODB_URI=mongodb://127.0.0.1:27017/posdev npm run seed:dev",
    );
    process.exitCode = 1;
    return;
  }

  await runRbacMeSanity(tokensByRole, cookieHeader);
  await runCatalogAlignment(tokensByRole.admin, cookieHeader);

  let failures = 0;
  let cells = 0;

  console.log("\n== HTTP matrix (role × route) ==");
  for (const probe of HTTP_PROBES) {
    console.log(`\n-- ${probe.id}: ${probe.method} ${probe.path}`);
    for (const role of ROLE_ORDER) {
      cells += 1;
      const expect403 = probe.predict403(role, can);
      const status = await req(probe.method, probe.path, tokensByRole[role], probe.body, cookieHeader);
      const { ok, reason } = outcomeMatches(status, expect403);
      const flag = ok ? "ok " : "FAIL";
      console.log(`  ${flag}  ${role.padEnd(8)} HTTP ${String(status).padStart(3)}  pred403=${expect403}  ${reason}`);
      if (!ok) failures += 1;
    }
  }

  console.log("\n== Summary ==");
  console.log(`  cells: ${cells}, failures: ${failures}`);
  if (failures > 0) {
    console.error("\nSome predictions did not match HTTP results (see DB RBAC overrides note in script header).");
    process.exitCode = 1;
    return;
  }
  console.log("All RBAC matrix checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    // Avoid Windows libuv crash when exiting synchronously right after fetch closes.
    setTimeout(() => process.exit(process.exitCode ?? 0), 50);
  });
