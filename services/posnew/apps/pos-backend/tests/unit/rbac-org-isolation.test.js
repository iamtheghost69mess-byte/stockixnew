/* global require, process, setTimeout, clearTimeout */
"use strict";

/**
 * RBAC config documents are scoped by organization. This integration test needs MongoDB.
 *
 *   RUN_RBAC_ORG_ISOLATION=1 MONGODB_URI=mongodb://127.0.0.1:27017/pos-rbac-iso-test \\
 *     npm test -- tests/unit/rbac-org-isolation.test.js
 */
const { test, after, before } = require("node:test");
const assert = require("node:assert/strict");

before(() => {
  if (process.env.RUN_RBAC_ORG_ISOLATION === "1") {
    require("dotenv").config();
  }
});

after(async () => {
  if (process.env.RUN_RBAC_ORG_ISOLATION !== "1") return;
  try {
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  } catch {
    /* ignore */
  }
});

test("GET /api/rbac/config returns only the caller organization config", async (t) => {
  if (process.env.RUN_RBAC_ORG_ISOLATION !== "1") {
    t.skip("set RUN_RBAC_ORG_ISOLATION=1 with MongoDB running");
    return;
  }

  process.env.JWT_SECRET =
    process.env.JWT_SECRET || "test_jwt_secret_min_32_chars_long_______";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-rbac-org-isolation";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const request = require("supertest");
  const Organization = require("../../models/organizationModel");
  const User = require("../../models/userModel");
  const RbacConfig = require("../../models/rbacConfigModel");
  const { app } = require("../../app");

  async function waitMongo() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Mongo connection timeout")),
        15000
      );
      mongoose.connection.once("open", () => {
        clearTimeout(timer);
        resolve(undefined);
      });
    });
  }

  await waitMongo();
  const suffix = Date.now();
  await Organization.deleteMany({ slug: { $in: [`rbac-iso-a-${suffix}`, `rbac-iso-b-${suffix}`] } });

  const orgA = await Organization.create({
    name: "RbacIsoA",
    slug: `rbac-iso-a-${suffix}`,
    lifecycle: "active",
  });
  const orgB = await Organization.create({
    name: "RbacIsoB",
    slug: `rbac-iso-b-${suffix}`,
    lifecycle: "active",
  });

  const hash = await bcrypt.hash("password123", 10);
  const userA = await User.create({
    name: "RbacIsoAdminA",
    email: `rbac-iso-a-${suffix}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgA._id,
  });
  await User.create({
    name: "RbacIsoAdminB",
    email: `rbac-iso-b-${suffix}@test.local`,
    passwordHash: hash,
    role: "admin",
    organization: orgB._id,
  });

  await RbacConfig.deleteMany({ organization: { $in: [orgA._id, orgB._id] } });

  const customKeyA = `only-org-a-${suffix}`;
  await RbacConfig.create({
    organization: orgA._id,
    builtinOverrides: {},
    customRoles: [
      {
        key: customKeyA,
        label: "Only A",
        can: ["pos.order.read"],
      },
    ],
  });
  await RbacConfig.create({
    organization: orgB._id,
    builtinOverrides: {},
    customRoles: [],
  });

  const loginA = await request(app)
    .post("/api/auth/login")
    .send({ email: userA.email, password: "password123" });
  assert.equal(loginA.status, 200);
  const tokenA = loginA.body.accessToken;

  const resA = await request(app)
    .get("/api/rbac/config")
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(resA.status, 200);
  const keysA = (resA.body.data?.customRoles || []).map((r) => r.key);
  assert.ok(keysA.includes(customKeyA));

  const loginB = await request(app)
    .post("/api/auth/login")
    .send({ email: `rbac-iso-b-${suffix}@test.local`, password: "password123" });
  assert.equal(loginB.status, 200);
  const tokenB = loginB.body.accessToken;

  const resB = await request(app)
    .get("/api/rbac/config")
    .set("Authorization", `Bearer ${tokenB}`);
  assert.equal(resB.status, 200);
  const keysB = (resB.body.data?.customRoles || []).map((r) => r.key);
  assert.equal(
    keysB.includes(customKeyA),
    false,
    "org B must not see org A custom role"
  );
});
