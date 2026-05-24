#!/usr/bin/env node
/**
 * QA hook: order lifecycle modules load. With MONGODB_URI or MONGO_URL set, also verifies
 * Mongo connectivity and that the orders collection is reachable (no writes).
 * For full paid-order integration proof, run inventory-integration-seed-test with MongoDB
 * and exercise draft → sent → billed → paid in a staging tenant.
 */

async function main() {
  const { recalcOrderTotals, modifierAdjustmentForLine } = require("../utils/orderTotals");
  const orderPrinting = require("../services/orderPrinting");

  if (typeof recalcOrderTotals !== "function") {
    console.error("recalcOrderTotals missing");
    process.exit(1);
  }
  if (typeof modifierAdjustmentForLine !== "function") {
    console.error("modifierAdjustmentForLine missing");
    process.exit(1);
  }
  if (typeof orderPrinting.printCustomerReceipt !== "function") {
    console.error("printCustomerReceipt missing");
    process.exit(1);
  }

  console.log("order lifecycle modules load OK");

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL;
  if (!mongoUri) {
    process.exit(0);
  }

  let mongoose;
  try {
    mongoose = require("mongoose");
  } catch {
    console.error("MONGODB_URI set but mongoose is not installed; skip DB smoke.");
    process.exit(0);
  }

  try {
    await mongoose.connect(mongoUri);
    const coll = mongoose.connection.db.collection("orders");
    const estimated = await coll.estimatedDocumentCount();
    console.log(`MongoDB smoke OK (orders collection estimated count: ${estimated})`);
    await mongoose.disconnect();
  } catch (err) {
    console.error("MongoDB smoke failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
