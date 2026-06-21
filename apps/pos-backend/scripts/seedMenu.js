/**
 * Sample menu for Phase 2 — idempotent: skips if any MenuItem exists.
 * Run from pos-backend: npm run seed:menu
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
require("../models/printerModel");
const Category = require("../models/categoryModel");
const MenuItem = require("../models/menuItemModel");
const Organization = require("../models/organizationModel");

const SAMPLE = [
  {
    cat: { name: "Salads", color: "#166534", availableFrom: "11:00", availableTo: "22:00" },
    items: [
      { name: "Caesar Salad", description: "Romaine, parmesan, croutons", price: 12.99, preparationTime: 10 },
      { name: "Greek Salad", description: "Feta, olives, cucumber", price: 11.5, preparationTime: 8 },
      { name: "Garden Salad", description: "Mixed greens, vinaigrette", price: 9.99, preparationTime: 7 },
    ],
  },
  {
    cat: { name: "Hot Kitchen", color: "#9a3412", availableFrom: "11:00", availableTo: "23:00" },
    items: [
      { name: "Grilled Chicken", description: "Herb marinade", price: 18.99, preparationTime: 25 },
      { name: "Beef Burger", description: "Cheddar, house sauce", price: 15.5, preparationTime: 18 },
      { name: "Pasta Alfredo", description: "Cream sauce", price: 14.0, preparationTime: 15 },
    ],
  },
  {
    cat: { name: "Bar", color: "#1e3a8a", availableFrom: "10:00", availableTo: "01:00" },
    items: [
      { name: "House Lager", description: "Draft 16oz", price: 6.0, preparationTime: 2 },
      { name: "Mojito", description: "Mint, lime, rum", price: 9.5, preparationTime: 5 },
    ],
  },
  {
    cat: { name: "Desserts", color: "#86198f", availableFrom: "12:00", availableTo: "23:00" },
    items: [
      { name: "Chocolate Cake", description: "Slice", price: 7.5, preparationTime: 3 },
      { name: "Ice Cream Duo", description: "Two scoops", price: 6.0, preparationTime: 3 },
    ],
  },
];

async function main() {
  await mongoose.connect(config.databaseURI);

  const slug = process.env.SEED_ORG_SLUG || "dev-org";
  const org = await Organization.findOne({ slug });
  if (!org) {
    console.error(`Organization with slug "${slug}" not found.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const orgId = org._id;

  const existingItems = await MenuItem.countDocuments({ organization: orgId });
  if (existingItems > 0) {
    console.log(`seed:menu skipped for ${slug} — menu items already exist.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  for (const block of SAMPLE) {
    let cat = await Category.findOne({ name: block.cat.name, organization: orgId });
    if (!cat) {
      cat = await Category.create({ ...block.cat, organization: orgId });
    }
    for (const it of block.items) {
      await MenuItem.create({
        ...it,
        organization: orgId,
        category: cat._id,
        isAvailable: true,
      });
    }
  }

  const count = await MenuItem.countDocuments({ organization: orgId });
  console.log(`seed:menu done for ${slug} — ${count} menu items created.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
