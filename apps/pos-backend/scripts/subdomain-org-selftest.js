#!/usr/bin/env node
/**
 * Subdomain organization self-test
 * =================================
 *
 * Verifies:
 * 1) Subdomain extraction middleware behavior (unknown/inactive/fallback).
 * 2) PIN login scoping by `req.subdomainOrg`.
 * 3) Device middleware org resolution order (subdomain first, PIN fallback).
 * 4) Wildcard POS origin matcher logic for CORS config helper.
 *
 * Usage (from apps/pos-backend):
 *   npm run test:subdomain-org
 *
 * Optional:
 *   SELFTEST_KEEP_DATA=1  # keep seeded rows for debugging
 */
require("dotenv").config();

const mongoose = require("mongoose");
const request = require("supertest");

const failures = [];

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
    console.error("  FAIL:", message);
  } else {
    console.log("  ok:", message);
  }
}

function assertEq(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${expected}, got ${actual})`);
}

async function waitMongoOpen() {
  if (mongoose.connection.readyState === 1) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Mongo connection timeout (15s)")),
      15_000
    );
    mongoose.connection.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const ts = Date.now();
  process.env.NODE_ENV = "development";
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || "test_jwt_secret_min_32_chars_long_______";
  process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET ||
    "test_platform_jwt_secret_32_chars_long__";
  process.env.MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-subdomain-selftest";

  console.log("Subdomain org self-test");
  console.log("  DB:", process.env.MONGODB_URI);

  const { app } = require("../app");
  const config = require("../config/config");

  await waitMongoOpen();

  const Organization = require("../models/organizationModel");
  const User = require("../models/userModel");
  const Device = require("../models/deviceModel");

  const activeA = await Organization.create({
    name: "Subdomain Active A",
    slug: `sub-a-${ts}`,
    lifecycle: "active",
  });
  const activeB = await Organization.create({
    name: "Subdomain Active B",
    slug: `sub-b-${ts}`,
    lifecycle: "active",
  });
  const inactive = await Organization.create({
    name: "Subdomain Inactive",
    slug: `sub-inactive-${ts}`,
    lifecycle: "suspended",
  });

  const userA = await User.create({
    organization: activeA._id,
    name: `sub-user-a-${ts}`,
    role: "admin",
    pin: "1234",
  });

  const cleanup = async () => {
    if (String(process.env.SELFTEST_KEEP_DATA || "") === "1") {
      console.log("\nSELFTEST_KEEP_DATA=1 — keeping seeded rows.");
      return;
    }
    await Device.deleteMany({
      organization: { $in: [activeA._id, activeB._id, inactive._id] },
    });
    await User.deleteMany({ _id: { $in: [userA._id] } });
    await Organization.deleteMany({
      _id: { $in: [activeA._id, activeB._id, inactive._id] },
    });
  };

  try {
    console.log("\n-- Middleware host behavior --");
    const unknownHostRes = await request(app)
      .get("/api/auth/session")
      .set("Host", `no-such-org-${ts}.pos.zerowix.cloud`);
    assertEq(unknownHostRes.status, 404, "Unknown org subdomain returns 404");
    assertEq(unknownHostRes.body.code, "ORG_NOT_FOUND", "Unknown org code");

    const inactiveRes = await request(app)
      .get("/api/auth/session")
      .set("Host", `${inactive.slug}.pos.zerowix.cloud`);
    assertEq(inactiveRes.status, 403, "Inactive org subdomain returns 403");
    assertEq(inactiveRes.body.code, "ORG_INACTIVE", "Inactive org code");

    const fallbackRootRes = await request(app)
      .get("/api/auth/session")
      .set("Host", "pos.zerowix.cloud");
    assertEq(fallbackRootRes.status, 200, "Root host fallback still works");
    assert(fallbackRootRes.body.success === true, "Root host session success shape");

    const fallbackLocalRes = await request(app)
      .get("/api/auth/session")
      .set("Host", "localhost");
    assertEq(fallbackLocalRes.status, 200, "localhost fallback still works");

    console.log("\n-- Device org resolution precedence --");
    const subdomainDeviceRes = await request(app)
      .post("/api/auth/login")
      .set("Host", `${activeB.slug}.pos.zerowix.cloud`)
      .send({ pin: "1234" });
    assertEq(
      subdomainDeviceRes.status,
      403,
      "Subdomain login without device cookie is blocked pending"
    );
    assertEq(
      subdomainDeviceRes.body.code,
      "DEVICE_PENDING",
      "Subdomain login blocked by device middleware"
    );
    const latestBDevice = await Device.findOne({
      organization: activeB._id,
      uuid: String(subdomainDeviceRes.headers["set-cookie"]?.[0] || "")
        .split(";")[0]
        .replace(/^device_uuid=/, ""),
    }).lean();
    assert(Boolean(latestBDevice), "Pending device created under subdomain org");

    const fallbackDeviceRes = await request(app)
      .post("/api/auth/login")
      .set("Host", "pos.zerowix.cloud")
      .send({ pin: "1234" });
    assertEq(
      fallbackDeviceRes.status,
      403,
      "Fallback host login without device cookie is blocked pending"
    );
    assertEq(
      fallbackDeviceRes.body.code,
      "DEVICE_PENDING",
      "Fallback login blocked by device middleware"
    );
    const fallbackCookie = String(fallbackDeviceRes.headers["set-cookie"]?.[0] || "")
      .split(";")[0]
      .replace(/^device_uuid=/, "");
    const latestADevice = await Device.findOne({
      organization: activeA._id,
      uuid: fallbackCookie,
    }).lean();
    assert(Boolean(latestADevice), "Fallback mode resolves org from PIN");

    console.log("\n-- PIN scoping by subdomain org --");
    const approvedBDevice = await Device.create({
      uuid: `approved-b-${ts}`,
      organization: activeB._id,
      status: "approved",
      nickname: null,
      lastSeenAt: new Date(),
    });
    const wrongOrgPin = await request(app)
      .post("/api/auth/login")
      .set("Host", `${activeB.slug}.pos.zerowix.cloud`)
      .set("Cookie", `device_uuid=${approvedBDevice.uuid}`)
      .send({ pin: "1234" });
    assertEq(
      wrongOrgPin.status,
      401,
      "Subdomain-scoped PIN lookup rejects PIN from another org"
    );
    assertEq(wrongOrgPin.body.code, "INVALID_PIN", "Wrong-org PIN code is INVALID_PIN");

    const approvedADevice = await Device.create({
      uuid: `approved-a-${ts}`,
      organization: activeA._id,
      status: "approved",
      nickname: null,
      lastSeenAt: new Date(),
    });
    const scopedSuccess = await request(app)
      .post("/api/auth/login")
      .set("Host", `${activeA.slug}.pos.zerowix.cloud`)
      .set("Cookie", `device_uuid=${approvedADevice.uuid}`)
      .send({ pin: "1234" });
    assertEq(scopedSuccess.status, 200, "Subdomain-scoped PIN login succeeds for matching org");
    assert(scopedSuccess.body.success === true, "Scoped PIN login response success");

    const fallbackSuccess = await request(app)
      .post("/api/auth/login")
      .set("Host", "pos.zerowix.cloud")
      .set("Cookie", `device_uuid=${approvedADevice.uuid}`)
      .send({ pin: "1234" });
    assertEq(fallbackSuccess.status, 200, "Fallback PIN login still works (no subdomain)");

    console.log("\n-- CORS wildcard matcher helper --");
    assert(
      config.isWildcardPosOrigin("https://alpha.pos.zerowix.cloud"),
      "Wildcard POS origin accepted"
    );
    assert(
      !config.isWildcardPosOrigin("https://pos.zerowix.cloud"),
      "Root POS origin not treated as wildcard"
    );
    assert(
      !config.isWildcardPosOrigin("https://dash.zerowix.cloud"),
      "Non-POS origin rejected by wildcard matcher"
    );
  } finally {
    await cleanup();
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s):`);
    failures.forEach((message) => console.error(" -", message));
    process.exit(1);
  }

  console.log("\nSubdomain org self-test: ALL OK");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
