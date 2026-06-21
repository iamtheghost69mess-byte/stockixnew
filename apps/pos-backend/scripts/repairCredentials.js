/**
 * CLI: rebuild masked defaultCredentials from bootstrap users (no plaintext recovery).
 * Prefer POST /api/platform/v1/organizations/:id/repair-credentials in production.
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const Organization = require("../models/organizationModel");
const { syncDefaultCredentialsFromUsers } = require("../services/defaultCredentialsSync");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB for credentials repair...");

  const orgs = await Organization.find({}).select("_id slug name").lean();
  let repairedCount = 0;

  for (const org of orgs) {
    const orgId = String(org._id);
    const before = await Organization.findById(orgId).select("defaultCredentials").lean();
    const beforeLen = Array.isArray(before?.defaultCredentials)
      ? before.defaultCredentials.length
      : 0;

    const result = await syncDefaultCredentialsFromUsers(orgId);
    if (result.syncedCount !== beforeLen) {
      console.log(
        `  [Repaired] ${org.slug || org.name}: ${beforeLen} → ${result.syncedCount} credential rows`,
      );
      repairedCount += 1;
    }
  }

  console.log(`\nRepair completed! Updated ${repairedCount} organizations.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("Repair script failed:", e);
  process.exit(1);
});
