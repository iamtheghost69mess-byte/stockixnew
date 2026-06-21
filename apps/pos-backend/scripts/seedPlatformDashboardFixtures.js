/**
 * Optional demo data for the platform (SaaS owner) control plane.
 * Safe to run multiple times: only inserts sample notifications when the collection is empty.
 *
 * Requires the same MongoDB URI as the API (`config.databaseURI` / `.env`).
 *
 * Usage (from apps/pos-backend):
 *   node scripts/seedPlatformDashboardFixtures.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const PlatformNotification = require("../models/platformNotificationModel");

async function main() {
  await mongoose.connect(config.databaseURI);
  const n = await PlatformNotification.estimatedDocumentCount();
  if (n > 0) {
    console.log(`PlatformNotification already has ${n} document(s); skip seed.`);
    await mongoose.disconnect();
    return;
  }
  await PlatformNotification.insertMany([
    {
      title: "Platform dashboard fixtures",
      body: "Sample notification for local QA of /notifications and unread counts.",
      severity: "info",
      href: "/audits",
      readBy: [],
    },
    {
      title: "Inventory review (sample)",
      body: "Another fixture row; mark-as-read flows can target this list.",
      severity: "warning",
      href: "/inventory",
      readBy: [],
    },
  ]);
  console.log("Inserted 2 sample platform notifications.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
