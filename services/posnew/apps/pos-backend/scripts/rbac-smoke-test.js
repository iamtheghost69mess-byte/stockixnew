#!/usr/bin/env node
/* global console, fetch, process */
/**
 * RBAC API smoke test — aligns with phases/roles.md expectations.
 * Requires API + MongoDB (dev seed: npm run seed:dev).
 *
 *   API_BASE=http://127.0.0.1:8010 node scripts/rbac-smoke-test.js
 *
 * PINs: admin 1001, manager 1002, waiter 1003, cashier 1004, kitchen 1005
 */
const BASE = process.env.API_BASE || "http://127.0.0.1:8010";

const PINS = {
  admin: "1001",
  manager: "1002",
  waiter: "1003",
  cashier: "1004",
  kitchen: "1005",
};

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

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`ok  ${name}`);
  return true;
}

async function main() {
  console.log(`RBAC smoke → ${BASE}\n`);

  let adminTok;
  try {
    adminTok = await login(PINS.admin);
  } catch (e) {
    console.error(e.message || e);
    console.error("\nStart the backend and seed dev users (npm run seed:dev), or set API_BASE.");
    process.exit(1);
    return;
  }

  const kitchenTok = await login(PINS.kitchen);
  const waiterTok = await login(PINS.waiter);
  const managerTok = await login(PINS.manager);

  const fakeOrderId = "507f1f77bcf86cd799439011";

  assert(
    "kitchen cannot list orders (no pos.order.read)",
    (await req("GET", "/api/orders", kitchenTok)) === 403
  );
  assert(
    "kitchen can read kitchen queue",
    (await req("GET", "/api/order/kitchen", kitchenTok)) === 200
  );

  assert("waiter can list orders (own scope)", (await req("GET", "/api/orders", waiterTok)) === 200);

  assert(
    "waiter cannot delete orders (no pos.order.cancel)",
    (await req("DELETE", `/api/orders/${fakeOrderId}`, waiterTok)) === 403
  );

  assert(
    "manager may call delete (permission); 404 if order missing",
    (await req("DELETE", `/api/orders/${fakeOrderId}`, managerTok)) === 404
  );

  assert(
    "waiter cannot transfer (no pos.order.transfer)",
    (await req("PATCH", `/api/orders/${fakeOrderId}/transfer`, waiterTok, {
      toTableId: fakeOrderId,
    })) === 403
  );

  assert(
    "admin can open RBAC catalog",
    (await req("GET", "/api/rbac/catalog", adminTok)) === 200
  );

  assert(
    "admin PUT rbac config rejects unknown permission in custom role",
    (await req("PUT", "/api/rbac/config", adminTok, {
      builtinOverrides: {},
      customRoles: [
        { key: "smokebadperm", label: "Bad perm", can: ["not.a.real.permission.id"] },
      ],
    })) === 400
  );

  assert(
    "admin PUT rbac config rejects unknown built-in override key",
    (await req("PUT", "/api/rbac/config", adminTok, {
      builtinOverrides: { not_a_builtin: { can: ["pos.order.read"] } },
      customRoles: [],
    })) === 400
  );

  assert(
    "manager cannot open RBAC catalog (admin + admin.rbac.manage only)",
    (await req("GET", "/api/rbac/catalog", managerTok)) === 403
  );

  assert(
    "manager cannot PUT rbac config",
    (await req("PUT", "/api/rbac/config", managerTok, {
      builtinOverrides: {},
      customRoles: [],
    })) === 403
  );

  assert(
    "waiter can read tax config",
    (await req("GET", "/api/config/tax", waiterTok)) === 200
  );

  assert(
    "kitchen cannot patch order status (no pos.order.update)",
    (await req("PATCH", `/api/order/${fakeOrderId}/status`, kitchenTok, {
      orderStatus: "paid",
    })) === 403
  );

  assert(
    "cashier can list orders (scoped)",
    (await req("GET", "/api/order", await login(PINS.cashier))) === 200
  );

  if (process.exitCode) {
    console.error("\nSome checks failed.");
    process.exit(1);
  } else {
    console.log("\nAll RBAC smoke checks passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
