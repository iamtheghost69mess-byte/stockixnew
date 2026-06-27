/**
 * Verifies staff seat cap: assertStaffCreateAllowed blocks when user count >= entitlements.maxUsers.
 *
 * Run (from apps/pos-backend): RUN_STAFF_ENTITLEMENTS_SELFTEST=1 node scripts/staff-entitlements-selftest.js
 * Requires MongoDB (MONGODB_URI).
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
const mongoose = require("mongoose");
const config = require("../config/config");
const Organization = require("../models/organizationModel");
const User = require("../models/userModel");
const { assertStaffCreateAllowed } = require("../services/entitlementService");

async function main() {
  if (process.env.RUN_STAFF_ENTITLEMENTS_SELFTEST !== "1") {
    console.log("Skip staff entitlements selftest (set RUN_STAFF_ENTITLEMENTS_SELFTEST=1 to run).");
    process.exit(0);
  }

  const uri = config.databaseURI;
  await mongoose.connect(uri);
  const slug = `staff-cap-${Date.now()}`;
  const org = await Organization.create({
    name: "Staff cap test",
    slug,
    lifecycle: "active",
    entitlements: {
      maxLocations: 5,
      maxUsers: 2,
      maxOrdersPerMonth: 10000,
      modules: { inventory: true, accounting: true },
    },
  });

  try {
    await assertStaffCreateAllowed(org._id);

    const p1 = String(100000 + Math.floor(Math.random() * 899999));
    let p2 = String(100000 + Math.floor(Math.random() * 899999));
    if (p2 === p1) p2 = String(100000 + Math.floor(Math.random() * 899999));
    await User.create({
      organization: org._id,
      name: "One",
      role: "waiter",
      pin: p1,
    });
    await User.create({
      organization: org._id,
      name: "Two",
      role: "waiter",
      pin: p2,
    });

    let blocked = false;
    try {
      await assertStaffCreateAllowed(org._id);
    } catch (e) {
      if (e.status === 403) blocked = true;
      else throw e;
    }
    if (!blocked) {
      throw new Error("Expected assertStaffCreateAllowed to throw 403 when at maxUsers");
    }

    console.log("staff-entitlements-selftest: OK (cap enforced at maxUsers=2)");
    process.exit(0);
  } finally {
    await User.deleteMany({ organization: org._id });
    await Organization.deleteOne({ _id: org._id });
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
