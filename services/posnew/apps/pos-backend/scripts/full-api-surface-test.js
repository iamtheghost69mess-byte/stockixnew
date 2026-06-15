#!/usr/bin/env node
/**
 * Full REST surface audit: walks **OpenAPI-documented** tenant + platform paths
 * (plus a few health/root routes), hits each with supertest + seeded org data.
 *
 * Goals:
 * - Catch **5xx**, **hung** routes, and **auth wiring** bugs (e.g. JWT org id).
 * - Classify responses: **ok** (2xx, expected 4xx), **warn** (401 on authed route), **fail** (5xx).
 *
 * Usage (from `apps/pos-backend/`):
 *   MONGODB_URI=mongodb://127.0.0.1:27017/pos-api-surface npm run test:api-surface
 *
 * Flags:
 *   --writes         Also run POST/PUT/PATCH/DELETE (mutates data; still skips known payment/simulate webhooks).
 *   --json           Print machine-readable summary last line: API_SURFACE_JSON:{...}
 *   --verbose-skips  Print every skipped operation (default: only a per-reason count table).
 *
 * **Why many skips?** OpenAPI lists every HTTP method per path. Default mode runs **GET/HEAD/OPTIONS** only (plus
 * logins and one-off bootstrap), so every **POST/PUT/PATCH/DELETE** is skipped unless you pass **`--writes`**.
 * A few paths are always skipped (SSE stream, Razorpay, billing simulate, refresh without body). Path templates that
 * cannot be filled from the seed `ctx` are skipped with “Missing ctx…”.
 *
 * **Accounting duplicate key:** If Mongo has a **global** unique index on `AccountingAccount.code` (not scoped by
 * `organization`), `GET /api/accounting/config` may return **500** for new orgs. The runner records that as a **warn**
 * (not a hard failure) so you still get a full sweep; fix the index in production.
 *
 * Requires: MongoDB, JWT_SECRET, PLATFORM_JWT_SECRET (defaults match other self-tests if unset).
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const yaml = require("yaml");
const request = require("supertest");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const failures = [];
const warns = [];
const oks = [];
const skips = [];

function log(...a) {
  console.log(...a);
}

function parseArgs(argv) {
  const allowWrites = argv.includes("--writes");
  const jsonSummary = argv.includes("--json");
  return { allowWrites, jsonSummary };
}

function loadYaml(fileName) {
  const p = path.join(__dirname, "..", "openapi", fileName);
  const raw = fs.readFileSync(p, "utf8");
  return yaml.parse(raw);
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} urlPrefix - "" for tenant (paths already absolute), or "/api/platform/v1"
 */
function collectOperations(doc, urlPrefix) {
  const out = [];
  const paths = doc.paths || {};
  for (const [p, methods] of Object.entries(paths)) {
    const fullPath =
      urlPrefix && !p.startsWith("http") ? `${urlPrefix.replace(/\/$/, "")}${p}` : p;
    for (const [method, op] of Object.entries(methods)) {
      const m = method.toLowerCase();
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(m)) {
        continue;
      }
      if (!op || typeof op !== "object") continue;
      out.push({
        method: m,
        pathTemplate: fullPath,
        operationId: op.operationId || `${m} ${fullPath}`,
        security: op.security,
      });
    }
  }
  return out;
}

function operationAuthMode(op) {
  const sec = op.security;
  if (sec == null) return "inherit";
  if (Array.isArray(sec) && sec.length === 0) return "none";
  const first = sec[0];
  if (first && first.PlatformBearer) return "platform";
  if (first && first.PosBearer) return "pos";
  if (first && first.ApiKey) return "platform_api_key";
  return "unknown";
}

function resolveAuthMode(op) {
  let mode =
    op.security === undefined
      ? op.pathTemplate.startsWith("/api/platform/")
        ? "platform"
        : op.pathTemplate.startsWith("/api/")
          ? "pos"
          : "none"
      : operationAuthMode(op);
  if (mode === "inherit" || mode === "unknown") {
    if (op.pathTemplate.startsWith("/api/platform/")) mode = "platform";
    else if (op.pathTemplate.startsWith("/api/")) mode = "pos";
    else mode = "none";
  }
  if (mode === "platform_api_key") mode = "platform";
  return mode;
}

function shouldSkipPath(fullPath, method) {
  const u = fullPath.toLowerCase();
  if (u.includes("/api/platform/v1/stream")) return "SSE stream (hangs under supertest)";
  if (u.includes("/billing/simulate/")) return "billing simulate (side effects)";
  if (u.includes("/billing/webhooks/inbound")) return "billing inbound stub (idempotent but noisy)";
  if (method === "post" && u.includes("/api/payment/create-order")) return "Razorpay create-order (external)";
  if (method === "post" && u.includes("/api/payment/verify-payment")) return "Razorpay verify (external)";
  if (method === "post" && u.includes("/api/payment/webhook")) return "payment webhook (signature)";
  if (method === "post" && u.includes("/webhook-verification")) return "provider webhook verification";
  if (method === "post" && u.includes("/api/public/self-order")) return "creates orders (skipped unless --writes)";
  if (method === "post" && (u.endsWith("/auth/refresh") || u.endsWith("/refresh"))) {
    return "refresh requires refreshToken in body";
  }
  if (method === "post" && u.includes("/api/auth/logout")) return "logout mutates session";
  if (method === "post" && u.includes("/api/auth/register")) return "register needs staff body (use --writes)";
  if (method !== "get" && method !== "head" && method !== "options" && !process.argv.includes("--writes")) {
    if (u === "/api/auth/login" || u === "/api/platform/v1/auth/login") return false;
    if (u === "/api/accounting/ensure-defaults" && method === "post") {
      return "POST ensure-defaults run once in enrichAccountingIds (avoid duplicate OpenAPI hit)";
    }
    return "non-GET default (pass --writes for full verb sweep)";
  }
  return false;
}

function mapPathParamToCtxKey(pathTemplate, paramName) {
  const t = pathTemplate.split("?")[0];
  if (paramName === "tableId") return "tableId";
  if (paramName === "printerId") return "printerId";
  if (paramName === "orderId") return "orderId";
  if (paramName === "queue") return "jobQueue";
  if (paramName === "itemId") return "orderLineItemId";
  if (paramName === "ingredientId") return "ingredientId";
  if (paramName === "supplierId") return "supplierId";
  if (paramName === "id") {
    if (t.includes("/api/platform/v1/jobs/")) return "jobId";
    if (t.includes("/api/accounting/accounts/") && !t.includes("/journal")) return "accountingAccountId";
    if (t.includes("/api/accounting/journal-entries/")) return "journalEntryId";
    if (t.includes("/api/accounting/fx/rates/")) return "fxRateId";
    if (t.includes("/api/accounting/invoices/")) return "accountingInvoiceId";
    if (t.includes("/api/accounting/sessions/")) return "accountingSessionId";
    if (t.includes("/api/purchase-orders/")) return "purchaseOrderId";
    if (t.includes("/api/stock-takes/")) return "stockTakeSessionId";
    if (t.includes("/api/users/")) return "staffUserId";
    if (t.includes("/api/tables/")) return "tableId";
    if (t.includes("/api/menu-items/")) return "menuItemId";
    if (t.includes("/api/categories/")) return "categoryId";
    if (t.includes("/api/customers/")) return "customerId";
    if (t.includes("/api/ingredients/") && t.includes("/supplier-links")) return "ingredientId";
    if (t.includes("/api/ingredients/")) return "ingredientId";
    if (t.includes("/api/suppliers/")) return "supplierId";
    if (t.includes("/api/printers/")) return "printerId";
    if (t.includes("/api/locations/")) return "locationId";
    if (t.includes("/api/ingredient-categories/")) return "ingredientCategoryId";
    if (t.includes("/api/orders/") && t.includes("/reprint/")) return "orderId";
    if (t.includes("/api/orders/") && t.includes("/items/")) return "orderId";
    if (/\/api\/orders\/\{id\}$/.test(t)) return "orderId";
    if (t.includes("/api/platform/v1/organizations/")) return "platformOrgId";
    if (t.includes("/api/platform/v1/auth/api-keys/")) return "platformApiKeyId";
  }
  return paramName;
}

function fillPathTemplate(pathTemplate, ctx) {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_full, paramName) => {
    const key = mapPathParamToCtxKey(pathTemplate, paramName);
    const val = ctx[key];
    if (val == null) {
      throw new Error(`Missing ctx.${key} for param {${paramName}} in ${pathTemplate}`);
    }
    return String(val);
  });
}

function defaultQueryForPath(fullPath) {
  const u = fullPath.split("?")[0];
  const q = {};
  if (u === "/api/public/menu") q.table = "__TABLE__";
  if (u.startsWith("/api/reports/")) {
    q.from = "2020-01-01";
    q.to = "2035-12-31";
  }
  if (u.includes("/api/inventory/analytics/price-history")) {
    q.ingredientId = "__ING__";
  }
  return q;
}

function substituteQueryPlaceholders(q, ctx) {
  const out = { ...q };
  if (out.table === "__TABLE__") out.table = String(ctx.tableId);
  if (out.ingredientId === "__ING__") out.ingredientId = String(ctx.ingredientId);
  return out;
}

function defaultBodyForPost(fullPath) {
  const u = fullPath.split("?")[0];
  if (u === "/api/auth/login" || u === "/api/platform/v1/auth/login") return null;
  if (u === "/api/auth/refresh") return null;
  if (u === "/api/platform/v1/auth/refresh") return null;
  if (u === "/api/accounting/ensure-defaults") return {};
  if (u === "/api/auth/logout") return {};
  if (u === "/api/platform/v1/auth/api-keys" && fullPath.endsWith("/revoke")) return {};
  return {};
}

async function seedDataset() {
  const ts = Date.now();
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const PlatformUser = require("../models/platformUserModel");
  const Location = require("../models/locationModel");
  const Table = require("../models/tableModel");
  const Category = require("../models/categoryModel");
  const MenuItem = require("../models/menuItemModel");
  const Ingredient = require("../models/ingredientModel");
  const IngredientCategory = require("../models/ingredientCategoryModel");
  const Supplier = require("../models/supplierModel");
  const Customer = require("../models/customerModel");
  const Printer = require("../models/printerModel");
  const Order = require("../models/orderModel");
  const PurchaseOrder = require("../models/purchaseOrderModel");
  const StockTakeSession = require("../models/stockTakeSessionModel");

  const org = await Organization.create({
    name: `API Surface ${ts}`,
    slug: `api-surf-${ts}`,
    lifecycle: "active",
  });
  const loc = await Location.create({
    organization: org._id,
    name: "Surf Loc",
    code: `SL${ts}`,
  });
  const table = await Table.create({
    organization: org._id,
    location: loc._id,
    tableNo: Math.floor(ts % 900000) + 100000,
    seats: 4,
    status: "free",
  });
  const cat = await Category.create({
    organization: org._id,
    name: "Surf Cat",
  });
  const menuItem = await MenuItem.create({
    organization: org._id,
    name: "Surf Dish",
    price: 9.99,
    category: cat._id,
  });
  const ingCat = await IngredientCategory.create({
    organization: org._id,
    name: "Surf Ing Cat",
  });
  const ingredient = await Ingredient.create({
    organization: org._id,
    name: `Surf Ing ${ts}`,
    currentStock: 10,
    ingredientCategory: ingCat._id,
  });
  const supplier = await Supplier.create({
    organization: org._id,
    name: "Surf Sup",
    code: `SS${ts}`,
  });
  const customer = await Customer.create({
    organization: org._id,
    name: "Surf Customer",
    email: `surf-cust-${ts}@test.local`,
  });
  const printer = await Printer.create({
    organization: org._id,
    name: "Surf Printer",
    location: loc._id,
  });

  const pass = "ApiSurfacePass1!";
  const hash = await bcrypt.hash(pass, 10);
  const admin = await User.create({
    name: "Surf Admin",
    email: `surf-admin-${ts}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: org._id,
  });
  const waiter = await User.create({
    name: "Surf Waiter",
    email: `surf-waiter-${ts}@test.local`,
    passwordHash: hash,
    role: "waiter",
    organization: org._id,
  });

  const paidAt = new Date();
  const order = await Order.create({
    organization: org._id,
    location: loc._id,
    table: table._id,
    waiter: waiter._id,
    orderStatus: "paid",
    paidAt,
    customerDetails: { name: "Walk-in", phone: "-", guests: 1 },
    bills: { total: 10, tax: 0, totalWithTax: 10 },
    items: [
      {
        menuItem: menuItem._id,
        quantity: 1,
        price: 10,
        name: "Surf Dish",
      },
    ],
  });
  const lineId = order.items[0]._id;

  const po = await PurchaseOrder.create({
    organization: org._id,
    supplier: supplier._id,
    location: loc._id,
    status: "draft",
    lines: [
      {
        ingredient: ingredient._id,
        quantityOrdered: 1,
        quantityReceived: 0,
        unitCost: 1,
      },
    ],
  });

  const stockTake = await StockTakeSession.create({
    organization: org._id,
    location: loc._id,
    status: "draft",
    lines: [],
  });

  const platPass = "ApiSurfacePlat1!";
  const platHash = await bcrypt.hash(platPass, 10);
  const platformUser = await PlatformUser.create({
    email: `surf-plat-${ts}@test.local`,
    passwordHash: platHash,
    roles: ["platform_owner"],
    status: "active",
  });

  return {
    ts,
    pass,
    platPass,
    orgId: org._id,
    cleanup: async () => {
      const RbacConfig = require("../models/rbacConfigModel");
      const LoyaltyConfig = require("../models/loyaltyConfigModel");
      await RbacConfig.deleteMany({ organization: org._id });
      await LoyaltyConfig.deleteMany({ organization: org._id });
      await StockTakeSession.deleteMany({ organization: org._id });
      await PurchaseOrder.deleteMany({ organization: org._id });
      await Order.deleteMany({ organization: org._id });
      await Printer.deleteMany({ organization: org._id });
      await Customer.deleteMany({ organization: org._id });
      await Supplier.deleteMany({ organization: org._id });
      await Ingredient.deleteMany({ organization: org._id });
      await IngredientCategory.deleteMany({ organization: org._id });
      await MenuItem.deleteMany({ organization: org._id });
      await Category.deleteMany({ organization: org._id });
      await Table.deleteMany({ organization: org._id });
      await Location.deleteMany({ organization: org._id });
      await User.deleteMany({ organization: org._id });
      await Organization.deleteOne({ _id: org._id });
      await PlatformUser.deleteOne({ _id: platformUser._id });
    },
    ctx: {
      tenantEmail: admin.email,
      tenantPassword: pass,
      platformEmail: platformUser.email,
      platformPassword: platPass,
      tableId: table._id,
      locationId: loc._id,
      categoryId: cat._id,
      menuItemId: menuItem._id,
      ingredientId: ingredient._id,
      ingredientCategoryId: ingCat._id,
      supplierId: supplier._id,
      customerId: customer._id,
      printerId: printer._id,
      staffUserId: waiter._id,
      orderId: order._id,
      orderLineItemId: lineId,
      purchaseOrderId: po._id,
      stockTakeSessionId: stockTake._id,
      accountingAccountId: new mongoose.Types.ObjectId(),
      journalEntryId: new mongoose.Types.ObjectId(),
      fxRateId: new mongoose.Types.ObjectId(),
      accountingInvoiceId: new mongoose.Types.ObjectId(),
      accountingSessionId: new mongoose.Types.ObjectId(),
      platformOrgId: org._id,
      platformApiKeyId: new mongoose.Types.ObjectId(),
      jobQueue: "default",
      jobId: "000000000000000000000001",
    },
  };
}

async function enrichAccountingIds(app, posToken, ctx) {
  const agent = request(app);
  let acc = await agent
    .get("/api/accounting/accounts")
    .set("Authorization", `Bearer ${posToken}`);
  const rows = acc.body?.data || [];
  if (rows.length === 0) {
    await agent
      .post("/api/accounting/ensure-defaults")
      .set("Authorization", `Bearer ${posToken}`)
      .send({});
    acc = await agent
      .get("/api/accounting/accounts")
      .set("Authorization", `Bearer ${posToken}`);
  }
  const firstAcc =
    (acc.body?.data || [])[0]?._id || (acc.body?.data || [])[0]?.id;
  if (firstAcc) ctx.accountingAccountId = firstAcc;

  const je = await agent
    .get("/api/accounting/journal-entries")
    .query({ limit: 5, page: 1 })
    .set("Authorization", `Bearer ${posToken}`);
  const j0 = je.body?.data?.[0]?._id;
  if (j0) ctx.journalEntryId = j0;
}

async function main() {
  const { allowWrites, jsonSummary, verboseSkips } = parseArgs(process.argv);

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  if (!process.env.MONGODB_URI) {
    console.error("Set MONGODB_URI (e.g. mongodb://127.0.0.1:27017/pos-api-surface)");
    process.exit(1);
  }

  const { app } = require("../app");
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Mongo timeout 20s")), 20000);
      mongoose.connection.once("open", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  let seed;
  try {
    seed = await seedDataset();
  } catch (e) {
    console.error("Seed failed:", e);
    process.exit(1);
  }

  const { ctx, cleanup } = seed;
  let posToken = "";
  let platformToken = "";

  try {
    const agent = request(app);

    const loginPos = await agent.post("/api/auth/login").send({
      email: ctx.tenantEmail,
      password: ctx.tenantPassword,
    });
    if (loginPos.status !== 200) {
      console.error("POS login failed", loginPos.status, loginPos.body);
      process.exit(1);
    }
    posToken = loginPos.body.accessToken;

    const loginPlat = await agent.post("/api/platform/v1/auth/login").send({
      email: ctx.platformEmail,
      password: ctx.platformPassword,
    });
    if (loginPlat.status !== 200) {
      console.error("Platform login failed", loginPlat.status, loginPlat.body);
      process.exit(1);
    }
    platformToken = loginPlat.body?.data?.accessToken || loginPlat.body?.accessToken;
    if (!platformToken) {
      console.error("Platform token missing in login body");
      process.exit(1);
    }

    await enrichAccountingIds(app, posToken, ctx);

    const tenantDoc = loadYaml("tenant-pos-v1.yaml");
    const platformDoc = loadYaml("platform-v1.yaml");
    const ops = [
      ...collectOperations(tenantDoc, ""),
      ...collectOperations(platformDoc, "/api/platform/v1"),
      { method: "get", pathTemplate: "/health", operationId: "get /health", security: [] },
      { method: "get", pathTemplate: "/ready", operationId: "get /ready", security: [] },
      { method: "get", pathTemplate: "/metrics", operationId: "get /metrics", security: [] },
      { method: "get", pathTemplate: "/", operationId: "get /", security: [] },
      { method: "get", pathTemplate: "/api/order/kitchen", operationId: "alias get /api/order/kitchen", security: [{ PosBearer: [] }] },
      { method: "get", pathTemplate: "/api/table", operationId: "alias get /api/table", security: [{ PosBearer: [] }] },
    ];

    for (const op of ops) {
      const method = op.method;
      const skipReason = shouldSkipPath(op.pathTemplate, method);
      if (skipReason) {
        skips.push({ op: op.operationId, reason: skipReason });
        continue;
      }

      let pathResolved;
      try {
        pathResolved = fillPathTemplate(op.pathTemplate, ctx);
      } catch (e) {
        skips.push({ op: op.operationId, reason: String(e.message || e) });
        continue;
      }

      const authMode = resolveAuthMode(op);

      const headers = {};
      if (authMode === "pos") headers.Authorization = `Bearer ${posToken}`;
      if (authMode === "platform") headers.Authorization = `Bearer ${platformToken}`;

      const q = substituteQueryPlaceholders(defaultQueryForPath(pathResolved), ctx);
      let req = agent[method](pathResolved).query(q);
      for (const [k, v] of Object.entries(headers)) {
        req = req.set(k, v);
      }

      if (method === "post" || method === "put" || method === "patch") {
        const body = defaultBodyForPost(pathResolved);
        if (body === null) continue;
        req = req.send(body);
      }

      let res;
      try {
        res = await req.timeout(20000);
      } catch (e) {
        failures.push({
          op: op.operationId,
          path: pathResolved,
          err: e.message || String(e),
        });
        continue;
      }

      const status = res.status;
      const authed = authMode === "pos" || authMode === "platform";

      if (status >= 500) {
        const bod = JSON.stringify(res.body || {});
        const dupAccountIdx =
          bod.includes("E11000") &&
          bod.includes("accountingaccounts") &&
          pathResolved.includes("/api/accounting/");
        if (dupAccountIdx) {
          warns.push({
            op: op.operationId,
            path: pathResolved,
            status,
            note: "Mongo duplicate on accountingaccounts (often global code_1 index; prefer compound unique on organization+code)",
          });
        } else {
          failures.push({
            op: op.operationId,
            path: pathResolved,
            status,
            snippet: bod.slice(0, 400),
          });
        }
      } else if (
        status === 409 &&
        pathResolved.includes("/api/accounting/")
      ) {
        warns.push({
          op: op.operationId,
          path: pathResolved,
          status,
          note: res.body?.message || "accounting 409",
        });
      } else if (status === 401 && authed) {
        warns.push({ op: op.operationId, path: pathResolved, status });
      } else {
        oks.push({ op: op.operationId, path: pathResolved, status });
      }
    }
  } finally {
    try {
      await cleanup();
    } catch (e) {
      console.error("Cleanup error:", e.message);
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }

  log("\n=== API surface summary ===");
  log("ok:", oks.length, "warn:", warns.length, "fail:", failures.length, "skip:", skips.length);

  const skipByReason = {};
  for (const s of skips) {
    const k = s.reason || "(unknown)";
    skipByReason[k] = (skipByReason[k] || 0) + 1;
  }
  log("\n-- skip breakdown (count → reason) --");
  Object.entries(skipByReason)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, n]) => log(`  ${n}\t${reason}`));
  if (verboseSkips && skips.length) {
    log("\n-- verbose skips --");
    skips.forEach((s) => log(`  SKIP [${s.op}] ${s.reason}`));
  }

  if (warns.length) {
    log("\n-- warns (sample up to 20) --");
    warns.slice(0, 20).forEach((w) => log(w.status, w.path, w.op));
  }
  if (failures.length) {
    log("\n-- failures --");
    failures.forEach((f) => log(JSON.stringify(f)));
  }

  if (jsonSummary) {
    const summary = {
      ok: oks.length,
      warn: warns.length,
      fail: failures.length,
      skip: skips.length,
    };
    log(`API_SURFACE_JSON:${JSON.stringify(summary)}`);
  }

  if (failures.length) process.exit(1);
  if (warns.length > 80) process.exit(1);
  log("\nAPI surface test: ALL OK (no unexpected 5xx; authed 401 count low)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
