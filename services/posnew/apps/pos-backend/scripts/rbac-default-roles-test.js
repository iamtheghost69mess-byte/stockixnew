#!/usr/bin/env node
/* global console, fetch, process */
/**
 * Default built-in role matrix — HTTP checks against a running API.
 * Expects `npm run seed:dev` PIN users (same as rbac-smoke-test.js + hostess).
 *
 *   API_BASE=http://127.0.0.1:8010 node scripts/rbac-default-roles-test.js
 *
 * PINs: admin 1001, manager 1002, waiter 1003, cashier 1004, kitchen 1005, hostess 1006
 */
const BASE = process.env.API_BASE || "http://127.0.0.1:8010";

const PINS = {
  admin: "1001",
  manager: "1002",
  waiter: "1003",
  cashier: "1004",
  kitchen: "1005",
  hostess: "1006",
};

const FAKE_ORDER_ID = "507f1f77bcf86cd799439011";
const FAKE_ITEM_ID = "507f1f77bcf86cd799439012";

/**
 * @param {string} pin
 * @returns {Promise<string>}
 */
async function login(pin) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ pin: String(pin) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`Login PIN ${pin}: ${r.status} ${j.message || JSON.stringify(j)}`);
  }
  const token = j.accessToken;
  if (!token) throw new Error("Login response missing accessToken");
  return token;
}

/**
 * @param {string} pin
 * @returns {Promise<string | null>}
 */
async function tryLogin(pin) {
  try {
    return await login(pin);
  } catch {
    return null;
  }
}

/**
 * @param {string} method
 * @param {string} path
 * @param {string} token
 * @param {unknown} [body]
 * @returns {Promise<number>}
 */
async function req(method, path, token, body) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, init);
  return r.status;
}

/**
 * @param {string} token
 * @returns {Promise<string[]>}
 */
async function getProfilePermissions(token) {
  const r = await fetch(`${BASE}/api/user`, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return [];
  const list = j.data?.permissions;
  return Array.isArray(list) ? list.map(String) : [];
}

/**
 * @param {readonly string[]} perms
 * @returns {boolean}
 */
function permsAllowPayment(perms) {
  return perms.some((p) => p === "*" || p.includes("pos.payment"));
}

/**
 * @param {string} name
 * @param {boolean} cond
 * @returns {boolean}
 */
function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`ok  ${name}`);
  return true;
}

/**
 * @param {string} name
 * @param {number} status
 * @param {number} expected
 * @returns {boolean}
 */
function assertStatus(name, status, expected) {
  return assert(`${name} (HTTP ${status} vs ${expected})`, status === expected);
}

/**
 * @param {string} name
 * @param {number} status
 * @returns {boolean}
 */
function assertNot403(name, status) {
  return assert(`${name} (HTTP ${status}, expected not 403)`, status !== 403);
}

async function main() {
  console.log(`RBAC default roles → ${BASE}\n`);

  /** @type {Record<string, string | null>} */
  let tokens;
  try {
    tokens = {
      admin: await login(PINS.admin),
      manager: await login(PINS.manager),
      waiter: await login(PINS.waiter),
      cashier: await login(PINS.cashier),
      kitchen: await login(PINS.kitchen),
      hostess: await tryLogin(PINS.hostess),
    };
  } catch (e) {
    console.error(e.message || e);
    console.error("\nStart the backend and seed dev users (npm run seed:dev), or set API_BASE.");
    process.exit(1);
    return;
  }

  if (!tokens.hostess) {
    console.warn(
      "WARN: hostess PIN 1006 login failed — re-run `npm run seed:dev` for hostess checks.\n"
    );
  }

  const t = tokens;

  // --- Catalog / floor read (pos.catalog.read, pos.table.read, location-scoped lists) ---
  assertStatus("admin GET /api/categories", await req("GET", "/api/categories", t.admin), 200);
  assertStatus("manager GET /api/categories", await req("GET", "/api/categories", t.manager), 200);
  assertStatus("waiter GET /api/categories", await req("GET", "/api/categories", t.waiter), 200);
  assertStatus("cashier GET /api/categories", await req("GET", "/api/categories", t.cashier), 200);
  assertStatus("kitchen GET /api/categories (no catalog)", await req("GET", "/api/categories", t.kitchen), 403);
  if (t.hostess) {
    assertStatus("hostess GET /api/categories", await req("GET", "/api/categories", t.hostess), 200);
  }

  assertStatus("admin GET /api/menu-items", await req("GET", "/api/menu-items", t.admin), 200);
  assertStatus("kitchen GET /api/menu-items (no catalog)", await req("GET", "/api/menu-items", t.kitchen), 403);

  assertStatus("waiter GET /api/tables", await req("GET", "/api/tables", t.waiter), 200);
  if (t.hostess) {
    assertStatus("hostess GET /api/tables", await req("GET", "/api/tables", t.hostess), 200);
  }
  assertStatus("kitchen GET /api/tables (no table read)", await req("GET", "/api/tables", t.kitchen), 403);

  // --- Config / printer / loyalty (pos.config.read, pos.printer.read, pos.loyalty.use) ---
  assertStatus("kitchen GET /api/config/tax (no config read)", await req("GET", "/api/config/tax", t.kitchen), 403);
  if (t.hostess) {
    assertStatus("hostess GET /api/config/tax", await req("GET", "/api/config/tax", t.hostess), 200);
  }

  assertStatus("waiter GET /api/printers", await req("GET", "/api/printers", t.waiter), 200);
  assertStatus("kitchen GET /api/printers (no printer read)", await req("GET", "/api/printers", t.kitchen), 403);

  assertStatus("waiter GET /api/loyalty/config", await req("GET", "/api/loyalty/config", t.waiter), 200);
  assertStatus("kitchen GET /api/loyalty/config (no loyalty)", await req("GET", "/api/loyalty/config", t.kitchen), 403);

  // --- Orders (pos.order.read / scoped lists) ---
  assertStatus("waiter GET /api/orders", await req("GET", "/api/orders", t.waiter), 200);
  assertStatus("cashier GET /api/order", await req("GET", "/api/order", t.cashier), 200);
  assertStatus("kitchen GET /api/orders (no order read)", await req("GET", "/api/orders", t.kitchen), 403);
  if (t.hostess) {
    assertStatus("hostess GET /api/orders (no orders)", await req("GET", "/api/orders", t.hostess), 403);
  }

  assertStatus("kitchen GET /api/order/kitchen", await req("GET", "/api/order/kitchen", t.kitchen), 200);
  assertStatus("waiter GET /api/order/kitchen (no kitchen read)", await req("GET", "/api/order/kitchen", t.waiter), 403);
  if (t.hostess) {
    assertStatus(
      "hostess GET /api/order/kitchen (no kitchen read)",
      await req("GET", "/api/order/kitchen", t.hostess),
      403
    );
  }

  assertStatus(
    "waiter DELETE /api/orders/:id (no cancel)",
    await req("DELETE", `/api/orders/${FAKE_ORDER_ID}`, t.waiter),
    403
  );
  assertStatus(
    "manager DELETE /api/orders/:id (cancel ok; 404 if missing)",
    await req("DELETE", `/api/orders/${FAKE_ORDER_ID}`, t.manager),
    404
  );

  assertStatus(
    "waiter PATCH /api/orders/:id/transfer (no transfer)",
    await req("PATCH", `/api/orders/${FAKE_ORDER_ID}/transfer`, t.waiter, {
      toTableId: FAKE_ORDER_ID,
    }),
    403
  );

  // Kitchen may hit controller with permission; expect not forbidden.
  assertNot403(
    "kitchen PATCH line item status (kitchen write; 404 if order missing)",
    await req(
      "PATCH",
      `/api/order/${FAKE_ORDER_ID}/items/${FAKE_ITEM_ID}/status`,
      t.kitchen,
      { lineItemStatus: "ready" }
    )
  );

  // --- Payments (pos.payment.* on cashier only among waiter/cashier; avoid Razorpay side-effects) ---
  assertStatus(
    "waiter POST /api/payment/create-order (no payment)",
    await req("POST", "/api/payment/create-order", t.waiter, {}),
    403
  );
  const waiterPerms = await getProfilePermissions(t.waiter);
  const cashierPerms = await getProfilePermissions(t.cashier);
  assert(
    "waiter profile permissions omit payment",
    !permsAllowPayment(waiterPerms)
  );
  assert(
    "cashier profile permissions include pos.payment.*",
    permsAllowPayment(cashierPerms)
  );

  // --- Back office (backoffice.*) ---
  assertStatus("manager GET /api/users (backoffice)", await req("GET", "/api/users", t.manager), 200);
  assertStatus("waiter GET /api/users (no backoffice)", await req("GET", "/api/users", t.waiter), 403);

  assertStatus(
    "manager GET /api/dashboard/default (backoffice)",
    await req("GET", "/api/dashboard/default", t.manager),
    200
  );
  assertStatus(
    "waiter GET /api/dashboard/default (no backoffice)",
    await req("GET", "/api/dashboard/default", t.waiter),
    403
  );

  // --- RBAC admin surface (admin job title + admin.rbac.manage) ---
  assertStatus("admin GET /api/rbac/catalog", await req("GET", "/api/rbac/catalog", t.admin), 200);
  assertStatus("manager GET /api/rbac/catalog", await req("GET", "/api/rbac/catalog", t.manager), 403);
  assertStatus("waiter GET /api/rbac/catalog", await req("GET", "/api/rbac/catalog", t.waiter), 403);

  if (process.exitCode) {
    console.error("\nSome default-role checks failed.");
    process.exit(1);
  } else {
    console.log("\nAll default-role matrix checks passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
