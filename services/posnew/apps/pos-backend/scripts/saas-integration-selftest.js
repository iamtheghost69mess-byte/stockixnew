#!/usr/bin/env node
/**
 * SaaS / multi-tenant integration self-test: seeds MongoDB + exercises tenant and platform
 * APIs via supertest (Express in-process; no separate `npm start` required).
 *
 * Covers: tenant auth, org-scoped ingredients + purchase orders, platform auth,
 * org create + Idempotency-Key replay, org list cursor fields, metrics shape, invitation accept.
 *
 * Usage (from pos-backend/):
 *   npm run test:saas-integration
 *
 * Environment (defaults work for local dev):
 *   JWT_SECRET, PLATFORM_JWT_SECRET (32+ chars in production), MONGODB_URI
 *   SELFTEST_KEEP_DATA=1 — skip DB cleanup of seeded rows (debug)
 *
 * Exit code 1 if any assertion fails.
 */
require("dotenv").config();

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const request = require("supertest");

const failures = [];

function assert(cond, msg) {
  if (!cond) {
    failures.push(msg);
    console.error("  FAIL:", msg);
  } else {
    console.log("  ok:", msg);
  }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} (expected ${b}, got ${a})`);
}

async function waitMongoOpen() {
  if (mongoose.connection.readyState === 1) return;
  await new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("Mongo connection timeout (15s)")),
      15000
    );
    mongoose.connection.once("open", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function cleanup(ctx, keepData) {
  if (keepData) {
    console.log("\nSELFTEST_KEEP_DATA=1 — leaving seeded documents.");
    return;
  }
  const {
    orgIds,
    userIds,
    platformUserId,
    invitationId,
    idempotencyKey,
    Organization,
    User,
    PlatformUser,
    Location,
    Supplier,
    Ingredient,
    PurchaseOrder,
    OrgInvitation,
    IdempotencyRecord,
  } = ctx;
  if (idempotencyKey) {
    await IdempotencyRecord.deleteMany({ key: idempotencyKey });
  }
  if (invitationId) {
    await OrgInvitation.deleteMany({ _id: invitationId });
  }
  await PurchaseOrder.deleteMany({ organization: { $in: orgIds } });
  await Ingredient.deleteMany({ organization: { $in: orgIds } });
  await Supplier.deleteMany({ organization: { $in: orgIds } });
  await Location.deleteMany({ organization: { $in: orgIds } });
  if (userIds?.length) {
    await User.deleteMany({ _id: { $in: userIds } });
  }
  if (platformUserId) {
    await PlatformUser.deleteMany({ _id: platformUserId });
  }
  await Organization.deleteMany({ _id: { $in: orgIds } });
  console.log("\nCleanup done.");
}

async function main() {
  const ts = Date.now();
  const slugPlatOrg = `saas-plat-${ts}`;
  const tenantPass = "SelftestPass1!";
  const platPass = "PlatformPass1!";
  const tenantEmail = `saas-tenant-${ts}@test.local`;
  const platEmail = `saas-plat-${ts}@test.local`;
  const inviteEmail = `saas-invite-${ts}@test.local`;
  const inviteTokenPlain = crypto.randomBytes(24).toString("hex");
  const idempotencyKey = `saas-idem-${ts}`;

  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-saas-selftest";

  console.log("SaaS integration self-test\n  DB:", process.env.MONGODB_URI);

  const { app } = require("../app");
  await waitMongoOpen();

  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const PlatformUser = require("../models/platformUserModel");
  const Location = require("../models/locationModel");
  const Supplier = require("../models/supplierModel");
  const Ingredient = require("../models/ingredientModel");
  const PurchaseOrder = require("../models/purchaseOrderModel");
  const OrgInvitation = require("../models/orgInvitationModel");
  const IdempotencyRecord = require("../models/idempotencyRecordModel");
  const BillingWebhookEvent = require("../models/billingWebhookEventModel");

  const orgA = await Organization.create({
    name: "SaaS Selftest A",
    slug: `saas-a-${ts}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "SaaS Selftest B",
    slug: `saas-b-${ts}`,
    lifecycle: "active",
  });
  let orgIds = [orgA._id, orgB._id];

  const locA = await Location.create({
    organization: orgA._id,
    name: "Loc A",
    code: `LA${ts}`,
  });
  const locB = await Location.create({
    organization: orgB._id,
    name: "Loc B",
    code: `LB${ts}`,
  });

  const supA = await Supplier.create({
    organization: orgA._id,
    name: "Sup A",
    code: `SA${ts}`,
  });
  await Supplier.create({
    organization: orgB._id,
    name: "Sup B",
    code: `SB${ts}`,
  });

  const ingA = await Ingredient.create({
    organization: orgA._id,
    location: locA._id,
    name: `Ingredient A ${ts}`,
  });
  const ingB = await Ingredient.create({
    organization: orgB._id,
    location: locB._id,
    name: `Ingredient B ${ts}`,
  });

  const poA = await PurchaseOrder.create({
    organization: orgA._id,
    supplier: supA._id,
    location: locA._id,
    status: "draft",
    lines: [
      {
        ingredient: ingA._id,
        quantityOrdered: 2,
        quantityReceived: 0,
        unitCost: 1,
      },
    ],
  });
  const poB = await PurchaseOrder.create({
    organization: orgB._id,
    supplier: (await Supplier.findOne({ organization: orgB._id }))._id,
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

  const hashTenant = await bcrypt.hash(tenantPass, 10);
  const userA = await User.create({
    name: "SaaS Tenant Admin",
    email: tenantEmail,
    passwordHash: hashTenant,
    role: "admin",
    organization: orgA._id,
  });

  const hashPlat = await bcrypt.hash(platPass, 10);
  const platformUser = await PlatformUser.create({
    email: platEmail,
    passwordHash: hashPlat,
    roles: ["platform_owner"],
    status: "active",
  });

  const tokHash = await bcrypt.hash(inviteTokenPlain, 10);
  const invitation = await OrgInvitation.create({
    organization: orgA._id,
    email: inviteEmail,
    roleHint: "waiter",
    tokenHash: tokHash,
    expiresAt: new Date(Date.now() + 86400000),
  });

  const cleanupCtx = {
    orgIds,
    userIds: [userA._id],
    platformUserId: platformUser._id,
    invitationId: invitation._id,
    idempotencyKey,
    Organization,
    User,
    PlatformUser,
    Location,
    Supplier,
    Ingredient,
    PurchaseOrder,
    OrgInvitation,
    IdempotencyRecord,
  };
  const orgIdSet = (doc) => String(doc?.organization?._id || doc?.organization || "");

  try {
    console.log("\n-- Health --");
    const health = await request(app).get("/health");
    assertEq(health.status, 200, "GET /health status");
    assert(health.body?.ok === true, "GET /health body.ok");
    assert(health.body?.service === "pos-backend", "GET /health service name");

    const ready = await request(app).get("/ready");
    assert(
      ready.status === 200 || ready.status === 503,
      "GET /ready returns 200 or 503"
    );
    assert(typeof ready.body?.mongo === "boolean", "GET /ready includes mongo flag");

    console.log("\n-- Tenant auth + org-scoped APIs --");
    const login = await request(app).post("/api/auth/login").send({
      email: tenantEmail,
      password: tenantPass,
    });
    assertEq(login.status, 200, "POST /api/auth/login");
    const accessToken = login.body.accessToken;
    assert(typeof accessToken === "string" && accessToken.length > 20, "tenant accessToken present");

    const ingList = await request(app)
      .get("/api/ingredients")
      .set("Authorization", `Bearer ${accessToken}`);
    assertEq(ingList.status, 200, "GET /api/ingredients");
    const ingData = ingList.body.data || [];
    assert(Array.isArray(ingData), "ingredients data is array");
    const ingOrgIds = new Set(ingData.map((x) => orgIdSet(x)).filter(Boolean));
    assert(ingOrgIds.size <= 1, "ingredients all same org");
    assert(ingData.some((x) => String(x._id) === String(ingA._id)), "ingredients includes orgA ingredient");
    assert(!ingData.some((x) => String(x._id) === String(ingB._id)), "ingredients excludes orgB ingredient");

    const putOther = await request(app)
      .put(`/api/ingredients/${ingB._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "nope" });
    assertEq(putOther.status, 404, "PUT other-org ingredient -> 404");

    const poList = await request(app)
      .get("/api/purchase-orders")
      .set("Authorization", `Bearer ${accessToken}`);
    assertEq(poList.status, 200, "GET /api/purchase-orders");
    const pos = poList.body.data || [];
    assert(
      pos.length === 1 && String(pos[0]._id) === String(poA._id),
      `purchase-orders expected one row poA (got ${pos.length})`
    );

    const poOther = await request(app)
      .get(`/api/purchase-orders/${poB._id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    assertEq(poOther.status, 404, "GET other-org PO -> 404");

    console.log("\n-- Organization lifecycle (suspended tenant API) --");
    await Organization.updateOne(
      { _id: orgA._id },
      { $set: { lifecycle: "suspended" } }
    );
    const suspendedIng = await request(app)
      .get("/api/ingredients")
      .set("Authorization", `Bearer ${accessToken}`);
    assertEq(suspendedIng.status, 403, "GET /api/ingredients when org suspended -> 403");
    assert(
      suspendedIng.body?.code === "ORGANIZATION_NOT_ACTIVE",
      "suspended org JSON code ORGANIZATION_NOT_ACTIVE"
    );
    await Organization.updateOne(
      { _id: orgA._id },
      { $set: { lifecycle: "active" } }
    );
    const afterResume = await request(app)
      .get("/api/ingredients")
      .set("Authorization", `Bearer ${accessToken}`);
    assertEq(afterResume.status, 200, "GET /api/ingredients after org re-activated -> 200");

    console.log("\n-- Platform auth + org provisioning --");
    const platLogin = await request(app).post("/api/platform/v1/auth/login").send({
      email: platEmail,
      password: platPass,
    });
    assertEq(platLogin.status, 200, "POST /api/platform/v1/auth/login");
    const platTok = platLogin.body?.data?.accessToken;
    assert(platTok, "platform accessToken present");

    const platAuth = { Authorization: `Bearer ${platTok}` };

    const orgBody = { name: "Plat Created Org", slug: slugPlatOrg };
    const c1 = await request(app)
      .post("/api/platform/v1/organizations")
      .set({ ...platAuth, "Idempotency-Key": idempotencyKey })
      .send(orgBody);
    const c2 = await request(app)
      .post("/api/platform/v1/organizations")
      .set({ ...platAuth, "Idempotency-Key": idempotencyKey })
      .send(orgBody);
    assertEq(c1.status, 201, "POST /organizations first");
    assertEq(c2.status, 201, "POST /organizations idempotent replay status");
    assert(
      JSON.stringify(c1.body) === JSON.stringify(c2.body),
      "POST /organizations idempotent same body"
    );
    const platOrgId = c1.body?.data?._id;
    if (platOrgId) {
      orgIds = [...orgIds, platOrgId];
      cleanupCtx.orgIds = orgIds;
    }

    const orgList = await request(app)
      .get("/api/platform/v1/organizations")
      .query({ limit: 5 })
      .set(platAuth);
    assertEq(orgList.status, 200, "GET /organizations");
    assert(orgList.body.success === true, "orgs list success");
    assert(Array.isArray(orgList.body.data), "orgs list data array");
    assert("nextCursor" in orgList.body, "orgs list nextCursor key");

    const metrics = await request(app)
      .get("/api/platform/v1/metrics/summary")
      .set(platAuth);
    assertEq(metrics.status, 200, "GET /metrics/summary");
    assert(metrics.body.success === true, "metrics success");
    const md = metrics.body.data || {};
    assert(typeof md.organizations === "number", "metrics organizations count");
    assert("productEventRollupRows7d" in md, "metrics productEventRollupRows7d");
    assert("productEventRollupEvents7d" in md, "metrics productEventRollupEvents7d");

    console.log("\n-- Invitation accept --");
    const accept = await request(app).post("/api/auth/invitations/accept").send({
      invitationId: String(invitation._id),
      token: inviteTokenPlain,
      password: tenantPass,
      name: "Invited User",
    });
    assertEq(accept.status, 200, "POST /api/auth/invitations/accept");
    assert(accept.body.success === true, "accept success");
    assert(String(accept.body.data?.organization) === String(orgA._id), "invited user org");
    if (accept.body.data?._id) {
      cleanupCtx.userIds = [...cleanupCtx.userIds, accept.body.data._id];
    }

    console.log("\n-- BillingWebhookEvent idempotency (DB) --");
    const prov = "saas-selftest";
    const peid = `evt-${ts}`;
    await BillingWebhookEvent.deleteMany({ provider: prov, providerEventId: peid });
    await BillingWebhookEvent.create({ provider: prov, providerEventId: peid });
    let dupErr = false;
    try {
      await BillingWebhookEvent.create({ provider: prov, providerEventId: peid });
    } catch (e) {
      dupErr = e.code === 11000;
    }
    assert(dupErr, "BillingWebhookEvent duplicate key");
    await BillingWebhookEvent.deleteMany({ provider: prov, providerEventId: peid });
  } finally {
    await cleanup(cleanupCtx, process.env.SELFTEST_KEEP_DATA === "1");
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }

  if (failures.length) {
    console.error("\n" + failures.length + " failure(s):");
    failures.forEach((f) => console.error(" -", f));
    process.exit(1);
  }
  console.log("\nSaaS integration self-test: ALL OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
