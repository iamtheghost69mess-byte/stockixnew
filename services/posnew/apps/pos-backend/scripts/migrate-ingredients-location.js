/**
 * Backfills Ingredient.location using existing stock balances, then primary org location.
 * Run: node scripts/migrate-ingredients-location.js
 */
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Ingredient = require("../models/ingredientModel");
const StockBalance = require("../models/stockBalanceModel");
const Location = require("../models/locationModel");

async function resolveFallbackLocationId(organizationId) {
  const row = await Location.findOne({ organization: organizationId })
    .sort({ createdAt: 1 })
    .select("_id")
    .lean();
  return row ? String(row._id) : null;
}

async function run() {
  await connectDB();
  const ingredients = await Ingredient.find({
    $or: [{ location: { $exists: false } }, { location: null }],
  })
    .select("_id organization")
    .lean();
  let migrated = 0;
  for (const ingredient of ingredients) {
    const balanceRow = await StockBalance.findOne({
      ingredient: ingredient._id,
      organization: ingredient.organization,
    })
      .sort({ updatedAt: -1 })
      .select("location")
      .lean();
    const locationId =
      (balanceRow && balanceRow.location && String(balanceRow.location)) ||
      (await resolveFallbackLocationId(ingredient.organization));
    if (!locationId) continue;
    await Ingredient.updateOne({ _id: ingredient._id }, { $set: { location: locationId } });
    migrated += 1;
  }
  // eslint-disable-next-line no-console
  console.log(`[migrate-ingredients-location] migrated=${migrated} total=${ingredients.length}`);
  await mongoose.connection.close();
}

run().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  await mongoose.connection.close();
  process.exit(1);
});

