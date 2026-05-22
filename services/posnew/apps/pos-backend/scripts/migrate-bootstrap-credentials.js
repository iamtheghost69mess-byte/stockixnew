/**
 * One-off: backfill `organization.defaultCredentials` when missing but the five
 * bootstrap users (name === role) already exist. PINs cannot be recovered from hashes;
 * rows use `pin: ""` — operators should reset PINs in the owner dashboard.
 *
 * Orgs missing any of the five users are logged for manual re-bootstrap.
 *
 * Usage: node scripts/migrate-bootstrap-credentials.js
 * Requires MONGO_URI / DATABASE env as per app config.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const Organization = require("../models/organizationModel");
const User = require("../models/userModel");

const DEFAULT_ROLES = ["admin", "manager", "waiter", "cashier", "kitchen"];

async function main() {
  await mongoose.connect(config.databaseURI);
  const orgs = await Organization.find({
    $or: [
      { defaultCredentials: { $exists: false } },
      { defaultCredentials: null },
      { defaultCredentials: [] },
    ],
  })
    .select("_id slug")
    .lean();

  for (const o of orgs) {
    const orgId = o._id;
    const missing = [];
    for (const role of DEFAULT_ROLES) {
      const u = await User.exists({
        organization: orgId,
        role,
        name: role,
      });
      if (!u) missing.push(role);
    }
    if (missing.length) {
      console.log(
        `[migrate-bootstrap-credentials] Org ${String(orgId)} (${o.slug || "no slug"}) needs manual re-bootstrap; missing roles: ${missing.join(", ")}`
      );
      continue;
    }
    const defaultCredentials = DEFAULT_ROLES.map((role) => ({
      role,
      name: role,
      pin: "",
    }));
    await Organization.updateOne(
      { _id: orgId },
      { $set: { defaultCredentials } }
    );
    console.log(
      `[migrate-bootstrap-credentials] Backfilled defaultCredentials (PINs empty — reset in dashboard) for org ${String(orgId)}`
    );
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
