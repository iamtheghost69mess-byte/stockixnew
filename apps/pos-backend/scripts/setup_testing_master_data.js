/**
 * Script to setup Master Data for POS Transactional Verification.
 * - Create Ingredient Categories
 * - Create Suppliers
 * - Create Ingredients
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const IngredientCategory = require("../models/ingredientCategoryModel");
const Supplier = require("../models/supplierModel");
const Ingredient = require("../models/ingredientModel");
const StockBalance = require("../models/stockBalanceModel");
const Location = require("../models/locationModel");

async function setup() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/pos");
  console.log("Connected to MongoDB");

  // Use a fixed tenant for testing if possible, or assume default
  const organizationId = new mongoose.Types.ObjectId("69e7fd04f8b5f5d42a587e92");

  // 1. Create Ingredient Categories
  const catNames = ["Vegetables", "Dairy", "Meat", "Grains"];
  const categories = [];
  for (const name of catNames) {
    let cat = await IngredientCategory.findOne({ name, organization: organizationId });
    if (!cat) {
      cat = await IngredientCategory.create({ name, organization: organizationId });
      console.log(`Created Category: ${name}`);
    }
    categories.push(cat);
  }

  // 2. Create Suppliers
  const supNames = ["Local Farm", "Global Dairy Co", "Prime Meats"];
  const suppliers = [];
  for (const name of supNames) {
    let sup = await Supplier.findOne({ name, organization: organizationId });
    if (!sup) {
      sup = await Supplier.create({
        name,
        contactPerson: "John Doe",
        email: `contact@${name.toLowerCase().replace(/ /g, "")}.com`,
        phone: "12345678",
        organization: organizationId
      });
      console.log(`Created Supplier: ${name}`);
    }
    suppliers.push(sup);
  }

  // 3. Create Ingredients
  const ings = [
    { name: "Tomato", unit: "kg", sku: "VEG-TOM", category: categories[0]._id, supplier: suppliers[0]._id, currentStock: 10 },
    { name: "Mozzarella", unit: "kg", sku: "DAI-MOZ", category: categories[1]._id, supplier: suppliers[1]._id, currentStock: 5 },
    { name: "Beef Patty", unit: "piece", sku: "MEA-BEEF", category: categories[2]._id, supplier: suppliers[2]._id, currentStock: 20 },
    { name: "Zero Stock Item", unit: "piece", sku: "ZERO-ITEM", category: categories[3]._id, supplier: suppliers[0]._id, currentStock: 0 },
  ];

  // Get a location for stock balances
  let loc = await Location.findOne({ organization: organizationId });
  if (!loc) {
    loc = await Location.create({ name: "Main Kitchen", code: "MAIN", organization: organizationId });
  }

  const ingredientMap = {};

  for (const item of ings) {
    let ing = await Ingredient.findOne({ sku: item.sku, organization: organizationId });
    if (!ing) {
      ing = await Ingredient.create({ ...item, organization: organizationId });
      console.log(`Created Ingredient: ${item.name}`);
    } else {
      ing.currentStock = item.currentStock;
      await ing.save();
      console.log(`Updated Ingredient: ${item.name} stock to ${item.currentStock}`);
    }
    ingredientMap[item.name] = ing;

    // Ensure StockBalance exists
    await StockBalance.findOneAndUpdate(
      { ingredient: ing._id, location: loc._id, organization: organizationId },
      { quantity: item.currentStock },
      { upsert: true, new: true }
    );
  }

  // 4. Create Recipes for Burgers
  const MenuItem = require("../models/menuItemModel");
  const Recipe = require("../models/recipeModel");

  const cb = await MenuItem.findOne({ name: "Cheese Burger", organization: organizationId });
  if (cb) {
    await Recipe.findOneAndUpdate(
      { menuItem: cb._id, organization: organizationId },
      {
        ingredients: [
          { ingredient: ingredientMap["Beef Patty"]._id, quantity: 1 },
          { ingredient: ingredientMap["Mozzarella"]._id, quantity: 0.05 }
        ]
      },
      { upsert: true }
    );
    console.log("Setup recipe for Cheese Burger");
  }

  const dcb = await MenuItem.findOne({ name: "Double cheese burger", organization: organizationId });
  if (dcb) {
    await Recipe.findOneAndUpdate(
      { menuItem: dcb._id, organization: organizationId },
      {
        ingredients: [
          { ingredient: ingredientMap["Beef Patty"]._id, quantity: 2 },
          { ingredient: ingredientMap["Mozzarella"]._id, quantity: 0.1 }
        ]
      },
      { upsert: true }
    );
    console.log("Setup recipe for Double cheese burger");
  }

  console.log("Master Data Setup Complete");
  process.exit(0);
}

setup().catch(err => {
  console.error(err);
  process.exit(1);
});
