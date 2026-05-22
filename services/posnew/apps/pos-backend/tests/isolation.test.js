/**
 * Tenant isolation integration test — requires MongoDB (RUN_ISOLATION=1).
 * Lazy-loads `app` only when running so local `npm test` works without MongoDB.
 */
const { test, after, before } = require("node:test");
const assert = require("node:assert/strict");

before(() => {
  if (process.env.RUN_ISOLATION === "1") {
    require("dotenv").config();
  }
});

after(async () => {
  if (process.env.RUN_ISOLATION !== "1") return;
  try {
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  } catch {
    /* ignore */
  }
});

test("cross-tenant order listing is isolated", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const Order = require("../models/orderModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await Organization.deleteMany({});
  await User.deleteMany({});
  await Order.deleteMany({});

  const orgA = await Organization.create({
    name: "A",
    slug: `iso-a-${Date.now()}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "B",
    slug: `iso-b-${Date.now()}`,
    lifecycle: "active",
  });

  const hash = await bcrypt.hash("password123", 10);
  const userA = await User.create({
    name: "UA",
    email: `ua-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgA._id,
  });
  await User.create({
    name: "UB",
    email: `ub-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgB._id,
  });

  const orderA = await Order.create({
    organization: orgA._id,
    orderStatus: "paid",
    customerDetails: { name: "g", phone: "-", guests: 1 },
    bills: { total: 1, tax: 0, totalWithTax: 1 },
  });
  await Order.create({
    organization: orgB._id,
    orderStatus: "paid",
    customerDetails: { name: "g", phone: "-", guests: 1 },
    bills: { total: 1, tax: 0, totalWithTax: 1 },
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: userA.email, password: "password123" });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const res = await request(app)
    .get("/api/tenant/orders")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(res.status, 200);
  const ids = (res.body.data || []).map((o) => String(o._id));
  assert.ok(ids.includes(String(orderA._id)));
  assert.equal(ids.length, 1);
});

test("platform JWT is rejected on tenant-protected routes", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const PlatformUser = require("../models/platformUserModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await PlatformUser.deleteMany({ email: "plat-verify@test.local" });
  const ph = await bcrypt.hash("password123", 10);
  const pu = await PlatformUser.create({
    email: "plat-verify@test.local",
    passwordHash: ph,
    roles: ["platform_owner"],
  });
  const { issuePlatformTokenPair } = require("../utils/platformAuthTokens");
  const { accessToken } = await issuePlatformTokenPair(pu);

  const res = await request(app)
    .get("/api/user")
    .set("Authorization", `Bearer ${accessToken}`);

  assert.equal(res.status, 401);
});

test("cross-tenant ingredient reads and writes are isolated", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const Ingredient = require("../models/ingredientModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await Organization.deleteMany({});
  await User.deleteMany({});
  await Ingredient.deleteMany({});

  const orgA = await Organization.create({
    name: "Ing-A",
    slug: `iso-ing-a-${Date.now()}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "Ing-B",
    slug: `iso-ing-b-${Date.now()}`,
    lifecycle: "active",
  });

  const hash = await bcrypt.hash("password123", 10);
  const userA = await User.create({
    name: "Ing-UA",
    email: `ing-ua-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgA._id,
  });

  const ingA = await Ingredient.create({
    organization: orgA._id,
    name: "Flour A",
  });
  const ingB = await Ingredient.create({
    organization: orgB._id,
    name: "Salt B",
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: userA.email, password: "password123" });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const list = await request(app)
    .get("/api/ingredients")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(list.status, 200);
  const ids = (list.body.data || []).map((x) => String(x._id));
  assert.ok(ids.includes(String(ingA._id)));
  assert.ok(!ids.includes(String(ingB._id)));

  const blocked = await request(app)
    .put(`/api/ingredients/${ingB._id}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Hacked" });
  assert.equal(blocked.status, 404);
});

test("cross-tenant purchase order listing is isolated", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const Location = require("../models/locationModel");
  const Supplier = require("../models/supplierModel");
  const Ingredient = require("../models/ingredientModel");
  const PurchaseOrder = require("../models/purchaseOrderModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await Organization.deleteMany({});
  await User.deleteMany({});
  await Location.deleteMany({});
  await Supplier.deleteMany({});
  await Ingredient.deleteMany({});
  await PurchaseOrder.deleteMany({});

  const orgA = await Organization.create({
    name: "PO-A",
    slug: `iso-po-a-${Date.now()}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "PO-B",
    slug: `iso-po-b-${Date.now()}`,
    lifecycle: "active",
  });

  const locA = await Location.create({
    organization: orgA._id,
    name: "Loc A",
    code: "LA",
  });
  const locB = await Location.create({
    organization: orgB._id,
    name: "Loc B",
    code: "LB",
  });

  const supA = await Supplier.create({
    organization: orgA._id,
    name: "Sup A",
    code: "SA",
  });
  const supB = await Supplier.create({
    organization: orgB._id,
    name: "Sup B",
    code: "SB",
  });

  const ingA = await Ingredient.create({
    organization: orgA._id,
    name: "Ing PO A",
  });
  const ingB = await Ingredient.create({
    organization: orgB._id,
    name: "Ing PO B",
  });

  const hash = await bcrypt.hash("password123", 10);
  const userA = await User.create({
    name: "PO-UA",
    email: `po-ua-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgA._id,
  });

  const poA = await PurchaseOrder.create({
    organization: orgA._id,
    supplier: supA._id,
    location: locA._id,
    status: "draft",
    lines: [
      {
        ingredient: ingA._id,
        quantityOrdered: 1,
        quantityReceived: 0,
        unitCost: 0,
      },
    ],
  });
  await PurchaseOrder.create({
    organization: orgB._id,
    supplier: supB._id,
    location: locB._id,
    status: "draft",
    lines: [
      {
        ingredient: ingB._id,
        quantityOrdered: 1,
        quantityReceived: 0,
        unitCost: 0,
      },
    ],
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: userA.email, password: "password123" });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const list = await request(app)
    .get("/api/purchase-orders")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(list.status, 200);
  const ids = (list.body.data || []).map((p) => String(p._id));
  assert.ok(ids.includes(String(poA._id)));
  assert.equal(ids.length, 1);

  const poB = await PurchaseOrder.findOne({ organization: orgB._id }).lean();
  assert.ok(poB);
  const blocked = await request(app)
    .get(`/api/purchase-orders/${poB._id}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(blocked.status, 404);
});

test("platform POST /organizations replays with Idempotency-Key", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const PlatformUser = require("../models/platformUserModel");
  const Organization = require("../models/organizationModel");
  const IdempotencyRecord = require("../models/idempotencyRecordModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();

  const slug = `iso-idem-${Date.now()}`;
  const idemKey = `idem-org-${slug}`;
  await IdempotencyRecord.deleteMany({ key: idemKey });
  await Organization.deleteMany({ slug });

  const ph = await bcrypt.hash("password123", 10);
  await PlatformUser.deleteMany({ email: "plat-idem@test.local" });
  const pu = await PlatformUser.create({
    email: "plat-idem@test.local",
    passwordHash: ph,
    roles: ["platform_owner"],
  });
  const { issuePlatformTokenPair } = require("../utils/platformAuthTokens");
  const { accessToken } = await issuePlatformTokenPair(pu);

  const payload = { name: "Idem Org", slug };
  const r1 = await request(app)
    .post("/api/platform/v1/organizations")
    .set("Authorization", `Bearer ${accessToken}`)
    .set("Idempotency-Key", idemKey)
    .send(payload);
  const r2 = await request(app)
    .post("/api/platform/v1/organizations")
    .set("Authorization", `Bearer ${accessToken}`)
    .set("Idempotency-Key", idemKey)
    .send(payload);

  assert.equal(r1.status, 201);
  assert.equal(r2.status, 201);
  assert.deepEqual(r1.body, r2.body);

  await IdempotencyRecord.deleteMany({ key: idemKey });
  await Organization.deleteMany({ slug });
  await PlatformUser.deleteMany({ email: "plat-idem@test.local" });
});

test("BillingWebhookEvent rejects duplicate provider + providerEventId", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const BillingWebhookEvent = require("../models/billingWebhookEventModel");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await BillingWebhookEvent.deleteMany({ provider: "iso-test", providerEventId: "evt-1" });

  await BillingWebhookEvent.create({
    provider: "iso-test",
    providerEventId: "evt-1",
  });

  await assert.rejects(
    async () =>
      BillingWebhookEvent.create({
        provider: "iso-test",
        providerEventId: "evt-1",
      }),
    (err) => err.code === 11000
  );
});

test("cross-tenant accounting journal list, detail, and export are isolated", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const AccountingAccount = require("../models/accountingAccountModel");
  const JournalEntry = require("../models/journalEntryModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await JournalEntry.deleteMany({ memo: { $in: ["ISO-ACC-A", "ISO-ACC-B"] } });
  await AccountingAccount.deleteMany({ code: { $in: ["ISO1000", "ISO4000"] } });
  await Organization.deleteMany({});
  await User.deleteMany({});

  const orgA = await Organization.create({
    name: "Acc-A",
    slug: `iso-acc-a-${Date.now()}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "Acc-B",
    slug: `iso-acc-b-${Date.now()}`,
    lifecycle: "active",
  });

  const hash = await bcrypt.hash("password123", 10);
  const userA = await User.create({
    name: "Acc-UA",
    email: `acc-ua-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgA._id,
  });

  const cashA = await AccountingAccount.create({
    organization: orgA._id,
    code: "ISO1000",
    name: "Cash A",
    type: "asset",
  });
  const revA = await AccountingAccount.create({
    organization: orgA._id,
    code: "ISO4000",
    name: "Revenue A",
    type: "revenue",
  });
  const cashB = await AccountingAccount.create({
    organization: orgB._id,
    code: "ISO1000",
    name: "Cash B",
    type: "asset",
  });
  const revB = await AccountingAccount.create({
    organization: orgB._id,
    code: "ISO4000",
    name: "Revenue B",
    type: "revenue",
  });

  const entryA = await JournalEntry.create({
    organization: orgA._id,
    entryNumber: 1,
    entryDate: new Date(),
    memo: "ISO-ACC-A",
    sourceType: "manual",
    lines: [
      { account: cashA._id, debit: 10, credit: 0 },
      { account: revA._id, debit: 0, credit: 10 },
    ],
  });
  const entryB = await JournalEntry.create({
    organization: orgB._id,
    entryNumber: 1,
    entryDate: new Date(),
    memo: "ISO-ACC-B",
    sourceType: "manual",
    lines: [
      { account: cashB._id, debit: 5, credit: 0 },
      { account: revB._id, debit: 0, credit: 5 },
    ],
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: userA.email, password: "password123" });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const list = await request(app)
    .get("/api/accounting/journal-entries")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(list.status, 200);
  const listIds = (list.body.data || []).map((x) => String(x._id));
  assert.ok(listIds.includes(String(entryA._id)));
  assert.ok(!listIds.includes(String(entryB._id)));

  const blocked = await request(app)
    .get(`/api/accounting/journal-entries/${entryB._id}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(blocked.status, 404);

  const csvRes = await request(app)
    .get("/api/accounting/export/journals.csv")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(csvRes.status, 200);
  assert.match(String(csvRes.text || ""), /ISO-ACC-A/);
  assert.ok(!String(csvRes.text || "").includes("ISO-ACC-B"));

  const jsonRes = await request(app)
    .get("/api/accounting/export/integration.json")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(jsonRes.status, 200);
  const exported = jsonRes.body.data || [];
  const exportedIds = exported.map((x) => String(x._id));
  assert.ok(exportedIds.includes(String(entryA._id)));
  assert.ok(!exportedIds.includes(String(entryB._id)));
});

test("cross-tenant customer listing and update are isolated", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const Customer = require("../models/customerModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await Organization.deleteMany({});
  await User.deleteMany({});
  await Customer.deleteMany({});

  const orgA = await Organization.create({
    name: "Cust-A",
    slug: `iso-cust-a-${Date.now()}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "Cust-B",
    slug: `iso-cust-b-${Date.now()}`,
    lifecycle: "active",
  });

  const hash = await bcrypt.hash("password123", 10);
  const userA = await User.create({
    name: "Cust-UA",
    email: `cust-ua-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgA._id,
  });

  const custA = await Customer.create({
    organization: orgA._id,
    name: "ISO-CUST-A",
    email: `iso-cust-a-${Date.now()}@test.local`,
  });
  const custB = await Customer.create({
    organization: orgB._id,
    name: "ISO-CUST-B",
    email: `iso-cust-b-${Date.now()}@test.local`,
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: userA.email, password: "password123" });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const list = await request(app)
    .get("/api/customers")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(list.status, 200);
  const ids = (list.body.data || []).map((c) => String(c._id));
  assert.ok(ids.includes(String(custA._id)));
  assert.ok(!ids.includes(String(custB._id)));

  const blocked = await request(app)
    .patch(`/api/customers/${custB._id}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Hacked" });
  assert.equal(blocked.status, 404);
});

test("cross-tenant sales report aggregates only own organization", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const Order = require("../models/orderModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await Organization.deleteMany({});
  await User.deleteMany({});
  await Order.deleteMany({});

  const orgA = await Organization.create({
    name: "Sales-A",
    slug: `iso-sales-a-${Date.now()}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "Sales-B",
    slug: `iso-sales-b-${Date.now()}`,
    lifecycle: "active",
  });

  const hash = await bcrypt.hash("password123", 10);
  const userA = await User.create({
    name: "Sales-UA",
    email: `sales-ua-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgA._id,
  });

  const now = new Date();
  await Order.create({
    organization: orgA._id,
    orderStatus: "paid",
    paidAt: now,
    customerDetails: { name: "g", phone: "-", guests: 1 },
    bills: { total: 100, tax: 0, totalWithTax: 100 },
  });
  await Order.create({
    organization: orgB._id,
    orderStatus: "paid",
    paidAt: now,
    customerDetails: { name: "g", phone: "-", guests: 1 },
    bills: { total: 999, tax: 0, totalWithTax: 999 },
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: userA.email, password: "password123" });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const from = "2020-01-01";
  const to = "2035-12-31";
  const sales = await request(app)
    .get(`/api/reports/sales?from=${from}&to=${to}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(sales.status, 200);
  assert.equal(sales.body.data?.summary?.orderCount, 1);
  assert.equal(sales.body.data?.summary?.totalRevenue, 100);

  const dash = await request(app)
    .get("/api/dashboard/default?range=7d")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(dash.status, 200);
  assert.equal(dash.body.success, true);
  assert.equal(dash.body.data?.summary?.totalRevenue, 100);
  assert.ok(Array.isArray(dash.body.data?.chartData));
  assert.ok(dash.body.data.chartData.length >= 1);
});

test("cross-tenant top-items report only includes own organization lines", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const Order = require("../models/orderModel");
  const Category = require("../models/categoryModel");
  const MenuItem = require("../models/menuItemModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await Order.deleteMany({});
  await MenuItem.deleteMany({});
  await Category.deleteMany({});
  await Organization.deleteMany({});
  await User.deleteMany({});

  const orgA = await Organization.create({
    name: "Top-A",
    slug: `iso-top-a-${Date.now()}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "Top-B",
    slug: `iso-top-b-${Date.now()}`,
    lifecycle: "active",
  });

  const catA = await Category.create({
    organization: orgA._id,
    name: "Cat A",
  });
  const catB = await Category.create({
    organization: orgB._id,
    name: "Cat B",
  });
  const dishA = await MenuItem.create({
    organization: orgA._id,
    name: "Dish A",
    price: 10,
    category: catA._id,
  });
  const dishB = await MenuItem.create({
    organization: orgB._id,
    name: "Dish B",
    price: 99,
    category: catB._id,
  });

  const now = new Date();
  await Order.create({
    organization: orgA._id,
    orderStatus: "paid",
    paidAt: now,
    customerDetails: { name: "g", phone: "-", guests: 1 },
    bills: { total: 10, tax: 0, totalWithTax: 10 },
    items: [
      {
        menuItem: dishA._id,
        quantity: 2,
        price: 20,
        name: "Dish A",
      },
    ],
  });
  await Order.create({
    organization: orgB._id,
    orderStatus: "paid",
    paidAt: now,
    customerDetails: { name: "g", phone: "-", guests: 1 },
    bills: { total: 99, tax: 0, totalWithTax: 99 },
    items: [
      {
        menuItem: dishB._id,
        quantity: 5,
        price: 495,
        name: "Dish B",
      },
    ],
  });

  const hash = await bcrypt.hash("password123", 10);
  const userA = await User.create({
    name: "Top-UA",
    email: `top-ua-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgA._id,
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: userA.email, password: "password123" });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const from = "2020-01-01";
  const to = "2035-12-31";
  const top = await request(app)
    .get(`/api/reports/top-items?from=${from}&to=${to}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(top.status, 200);
  const items = top.body.data?.items || [];
  assert.equal(items.length, 1);
  assert.equal(String(items[0].menuItemId), String(dishA._id));
  assert.equal(items[0].quantity, 2);
});

test("cross-tenant loyalty redeem cannot target another org customer account", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const Customer = require("../models/customerModel");
  const LoyaltyAccount = require("../models/loyaltyAccountModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await LoyaltyAccount.deleteMany({});
  await Customer.deleteMany({});
  await Organization.deleteMany({});
  await User.deleteMany({});

  const orgA = await Organization.create({
    name: "Loy-A",
    slug: `iso-loy-a-${Date.now()}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "Loy-B",
    slug: `iso-loy-b-${Date.now()}`,
    lifecycle: "active",
  });

  const custA = await Customer.create({
    organization: orgA._id,
    name: "Loyalty Cust A",
    email: `loy-cust-a-${Date.now()}@test.local`,
  });
  await LoyaltyAccount.create({
    organization: orgA._id,
    customer: custA._id,
    points: 100,
  });

  const hash = await bcrypt.hash("password123", 10);
  const userB = await User.create({
    name: "Loy-UB",
    email: `loy-ub-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgB._id,
  });

  const loginB = await request(app)
    .post("/api/auth/login")
    .send({ email: userB.email, password: "password123" });
  assert.equal(loginB.status, 200);
  const tokenB = loginB.body.accessToken;

  const redeem = await request(app)
    .post("/api/loyalty/redeem")
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ customerId: String(custA._id), points: 10 });
  assert.equal(redeem.status, 404);
});

test("cross-tenant inventory waste analytics excludes other organizations", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const Ingredient = require("../models/ingredientModel");
  const StockMovement = require("../models/stockMovementModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await StockMovement.deleteMany({});
  await Ingredient.deleteMany({});
  await Organization.deleteMany({});
  await User.deleteMany({});

  const orgA = await Organization.create({
    name: "Waste-A",
    slug: `iso-waste-a-${Date.now()}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "Waste-B",
    slug: `iso-waste-b-${Date.now()}`,
    lifecycle: "active",
  });

  const ingA = await Ingredient.create({
    organization: orgA._id,
    name: `Waste Ing A ${Date.now()}`,
    currentStock: 100,
  });
  const ingB = await Ingredient.create({
    organization: orgB._id,
    name: `Waste Ing B ${Date.now()}`,
    currentStock: 100,
  });

  const ts = new Date();
  await StockMovement.create({
    organization: orgA._id,
    ingredient: ingA._id,
    delta: -3,
    balanceAfter: 97,
    reason: "waste",
    wasteReasonCode: "spoil",
    createdAt: ts,
  });
  await StockMovement.create({
    organization: orgB._id,
    ingredient: ingB._id,
    delta: -50,
    balanceAfter: 50,
    reason: "waste",
    wasteReasonCode: "spoil",
    createdAt: ts,
  });

  const hash = await bcrypt.hash("password123", 10);
  const userA = await User.create({
    name: "Waste-UA",
    email: `waste-ua-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgA._id,
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: userA.email, password: "password123" });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const waste = await request(app)
    .get("/api/inventory/analytics/waste")
    .set("Authorization", `Bearer ${token}`)
    .query({ from: "2020-01-01", to: "2035-12-31" });
  assert.equal(waste.status, 200);
  const rows = waste.body.data || [];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantityDelta, -3);
  assert.equal(rows[0].movementCount, 1);
});

test("cross-tenant inventory customer returns are isolated and recorded", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const Ingredient = require("../models/ingredientModel");
  const Location = require("../models/locationModel");
  const StockMovement = require("../models/stockMovementModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await StockMovement.deleteMany({});
  await Location.deleteMany({});
  await Ingredient.deleteMany({});
  await Organization.deleteMany({});
  await User.deleteMany({});

  const orgA = await Organization.create({
    name: "Return-A",
    slug: `iso-return-a-${Date.now()}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "Return-B",
    slug: `iso-return-b-${Date.now()}`,
    lifecycle: "active",
  });

  const locA = await Location.create({
    organization: orgA._id,
    name: "Return Loc A",
    code: "RLA",
  });
  await Location.create({
    organization: orgB._id,
    name: "Return Loc B",
    code: "RLB",
  });

  const ingA = await Ingredient.create({
    organization: orgA._id,
    name: `Return Ing A ${Date.now()}`,
    currentStock: 5,
  });
  const ingB = await Ingredient.create({
    organization: orgB._id,
    name: `Return Ing B ${Date.now()}`,
    currentStock: 5,
  });

  const hash = await bcrypt.hash("password123", 10);
  const userA = await User.create({
    name: "Return-UA",
    email: `return-ua-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgA._id,
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: userA.email, password: "password123" });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const ownReturn = await request(app)
    .post("/api/inventory/returns")
    .set("Authorization", `Bearer ${token}`)
    .send({
      ingredientId: String(ingA._id),
      quantity: 2,
      locationId: String(locA._id),
      note: "customer returned unopened item",
    });
  assert.equal(ownReturn.status, 200);
  assert.equal(ownReturn.body?.data?.delta, 2);

  const blockedOtherTenant = await request(app)
    .post("/api/inventory/returns")
    .set("Authorization", `Bearer ${token}`)
    .send({
      ingredientId: String(ingB._id),
      quantity: 1,
    });
  assert.equal(blockedOtherTenant.status, 404);

  const movements = await StockMovement.find({
    organization: orgA._id,
    ingredient: ingA._id,
    reason: "customer_return",
  }).lean();
  assert.equal(movements.length, 1);
  assert.equal(Number(movements[0].delta), 2);
});

test("inventory endpoints reject malformed query parameters", async (t) => {
  if (process.env.RUN_ISOLATION !== "1") {
    t.skip("set RUN_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const { app } = require("../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await waitMongo();
  await Organization.deleteMany({});
  await User.deleteMany({});

  const org = await Organization.create({
    name: "Inv-Validate",
    slug: `iso-inv-validate-${Date.now()}`,
    lifecycle: "active",
  });
  const hash = await bcrypt.hash("password123", 10);
  const user = await User.create({
    name: "Inv-Validator",
    email: `inv-validate-${Date.now()}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: org._id,
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: user.email, password: "password123" });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const badMovements = await request(app)
    .get("/api/inventory/movements?from=not-a-date")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(badMovements.status, 400);

  const badValuation = await request(app)
    .get("/api/inventory/report/valuation?costMethod=abc")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(badValuation.status, 400);

  const badSlowMoving = await request(app)
    .get("/api/inventory/report/slow-moving?days=-3")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(badSlowMoving.status, 400);
});
