/**
 * Smoke test: inventory settings, recipe flatten, reservation helpers.
 * Run: cd pos-backend && node scripts/inventory-deduct-selftest.js
 *
 * Requires MongoDB (same DATABASE_URI / config as app).
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");

require("../models/menuItemModel");
require("../models/ingredientModel");
require("../models/recipeModel");
require("../models/locationModel");
require("../models/accountingConfigModel");

const { getInventorySettings, shouldDeductOnPayment } = require("../services/inventorySettingsService");
const { flattenRecipeDemand } = require("../services/inventoryRecipeUtils");
const accountingService = require("../services/accountingService");
const {
  resolveAnchorOrganizationId,
} = require("../utils/resolveAnchorOrganizationId");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

async function run() {
  await mongoose.connect(config.databaseURI);
  const orgId = await resolveAnchorOrganizationId();
  await accountingService.ensureDefaultAccountsAndConfig(orgId);
  const s = await getInventorySettings(orgId);
  assert(s.stockDeductTrigger, "stockDeductTrigger");
  assert(typeof s.strictOversell === "boolean", "strictOversell bool");
  assert(typeof s.reserveStockOnPending === "boolean", "reserveStockOnPending bool");
  assert(typeof shouldDeductOnPayment(s) === "boolean", "shouldDeductOnPayment");

  const Recipe = require("../models/recipeModel");
  const MenuItem = require("../models/menuItemModel");
  const Ingredient = require("../models/ingredientModel");
  const Category = require("../models/categoryModel");
  const Location = require("../models/locationModel");

  const cat = await Category.findOne();
  if (!cat) {
    console.log("SKIP nested BOM test (no category). Core settings OK.");
    await mongoose.disconnect();
    return;
  }

  const suffix = `invtest_${Date.now()}`;
  const location = await Location.findOne({ organization: orgId }).select("_id").lean();
  if (!location?._id) {
    throw new Error("inventory-deduct-selftest requires one location for the anchor organization.");
  }
  const miA = await MenuItem.create({
    name: `A ${suffix}`,
    price: 1,
    category: cat._id,
  });
  const miB = await MenuItem.create({
    name: `B ${suffix}`,
    price: 1,
    category: cat._id,
  });
  const ing = await Ingredient.create({
    organization: orgId,
    location: location._id,
    name: `ing ${suffix}`,
    unit: "g",
    currentStock: 1000,
  });

  await Recipe.create({
    menuItem: miB._id,
    ingredients: [{ ingredient: ing._id, quantity: 10 }],
  });
  await Recipe.create({
    menuItem: miA._id,
    ingredients: [{ subMenuItem: miB._id, quantity: 2 }],
  });

  const flat = await flattenRecipeDemand(miA._id, 1);
  assert(flat.length === 1 && flat[0].qty === 20, `flatten expected 20g got ${JSON.stringify(flat)}`);

  await Recipe.deleteMany({ menuItem: { $in: [miA._id, miB._id] } });
  await MenuItem.deleteMany({ _id: { $in: [miA._id, miB._id] } });
  await Ingredient.deleteOne({ _id: ing._id });

  console.log("inventory-deduct-selftest: OK");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
