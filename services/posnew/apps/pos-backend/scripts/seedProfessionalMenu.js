/**
 * Professional menu seeder (organization-scoped, idempotent upsert).
 *
 * Usage:
 *   node scripts/seedProfessionalMenu.js --org=montaser-pos-tes
 *   node scripts/seedProfessionalMenu.js --org=montaser-pos-tes --replace
 *
 * Notes:
 * - `--replace` deletes existing categories/menu items for the organization before seeding.
 * - Without `--replace`, this script upserts by name/category to avoid duplicates.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const Organization = require("../models/organizationModel");
const Category = require("../models/categoryModel");
const MenuItem = require("../models/menuItemModel");

function parseArgs() {
  const args = process.argv.slice(2);
  const byFlag = (flagName) => {
    const prefix = `--${flagName}=`;
    const hit = args.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length).trim() : "";
  };
  return {
    orgSlug: byFlag("org") || process.env.ORG_SLUG || "montaser-pos-tes",
    replace: args.includes("--replace"),
  };
}

function toLegacyPrice(priceUsd, priceLbp) {
  const usd = Math.max(0, Number(priceUsd) || 0);
  const lbp = Math.max(0, Number(priceLbp) || 0);
  if (usd > 0) return { price: usd, currency: "USD" };
  if (lbp > 0) return { price: lbp, currency: "LBP" };
  return { price: 0, currency: "USD" };
}

const PROFESSIONAL_MENU = {
  categories: [
    {
      name: "Beverages",
      color: "#2563eb",
      sortOrder: 1,
      menuNote: "Crafted drinks, mocktails, hot beverages, and premium coffee.",
      availableFrom: "08:00",
      availableTo: "23:59",
    },
    {
      name: "Soft Drinks",
      parentName: "Beverages",
      color: "#0ea5e9",
      sortOrder: 2,
      menuNote: "Classic fizzy options served chilled.",
      availableFrom: "08:00",
      availableTo: "23:59",
    },
    {
      name: "Alcohol",
      parentName: "Beverages",
      color: "#7c3aed",
      sortOrder: 3,
      menuNote: "Premium spirits, wines, and signature cocktails.",
      availableFrom: "12:00",
      availableTo: "01:00",
    },
    {
      name: "Italian Food",
      color: "#dc2626",
      sortOrder: 4,
      menuNote: "Authentic Italian recipes with premium ingredients.",
      availableFrom: "11:00",
      availableTo: "23:59",
    },
    {
      name: "Burgers",
      color: "#92400e",
      sortOrder: 5,
      menuNote: "Juicy gourmet burgers grilled to order.",
      availableFrom: "11:00",
      availableTo: "23:59",
    },
    {
      name: "Pizzas",
      color: "#ea580c",
      sortOrder: 6,
      menuNote: "Stone-baked pizzas with hand-stretched dough.",
      availableFrom: "11:00",
      availableTo: "23:59",
    },
    {
      name: "Shisha",
      color: "#4b5563",
      sortOrder: 7,
      menuNote: "Premium shisha blends and signature mixes.",
      availableFrom: "14:00",
      availableTo: "02:00",
    },
  ],
  items: [
    {
      categoryName: "Soft Drinks",
      name: "Coca-Cola",
      description: "Classic Coca-Cola can served chilled.",
      menuNote: "Best served with citrus.",
      priceUsd: 2.5,
      priceLbp: 225000,
      preparationTime: 1,
      tags: ["soft-drink", "cola"],
    },
    {
      categoryName: "Soft Drinks",
      name: "Sprite",
      description: "Lemon-lime sparkling soda.",
      menuNote: "Refreshing citrus finish.",
      priceUsd: 2.5,
      priceLbp: 225000,
      preparationTime: 1,
      tags: ["soft-drink", "lemon-lime"],
    },
    {
      categoryName: "Soft Drinks",
      name: "7UP",
      description: "Crisp and clear lemon-lime soft drink.",
      menuNote: "Light and bubbly.",
      priceUsd: 2.5,
      priceLbp: 225000,
      preparationTime: 1,
      tags: ["soft-drink", "7up"],
    },
    {
      categoryName: "Soft Drinks",
      name: "Mojitos Strawberry",
      description: "Non-alcoholic mojito with fresh strawberry puree.",
      menuNote: "Fresh mint and strawberry balance.",
      priceUsd: 6.5,
      priceLbp: 585000,
      preparationTime: 4,
      tags: ["mocktail", "strawberry"],
    },
    {
      categoryName: "Soft Drinks",
      name: "Mojitos Watermelon",
      description: "Non-alcoholic mojito with ripe watermelon.",
      menuNote: "Summer-style cooling drink.",
      priceUsd: 6.5,
      priceLbp: 585000,
      preparationTime: 4,
      tags: ["mocktail", "watermelon"],
    },
    {
      categoryName: "Soft Drinks",
      name: "Iced Americano",
      description: "Double espresso over ice and water.",
      menuNote: "No sugar by default.",
      priceUsd: 4.5,
      priceLbp: 405000,
      preparationTime: 3,
      tags: ["coffee", "iced"],
    },
    {
      categoryName: "Alcohol",
      name: "House Red Wine Glass",
      description: "Balanced red wine by the glass.",
      menuNote: "Pairs well with pasta and beef.",
      priceUsd: 8.0,
      priceLbp: 720000,
      preparationTime: 2,
      tags: ["wine", "red"],
    },
    {
      categoryName: "Alcohol",
      name: "House White Wine Glass",
      description: "Crisp white wine by the glass.",
      menuNote: "Great with seafood and light pasta.",
      priceUsd: 8.0,
      priceLbp: 720000,
      preparationTime: 2,
      tags: ["wine", "white"],
    },
    {
      categoryName: "Alcohol",
      name: "Classic Mojito",
      description: "White rum, fresh mint, lime juice, and soda.",
      menuNote: "Premium white rum base.",
      priceUsd: 9.5,
      priceLbp: 855000,
      preparationTime: 5,
      tags: ["cocktail", "rum"],
    },
    {
      categoryName: "Alcohol",
      name: "Aperol Spritz",
      description: "Aperol, prosecco, and soda with orange.",
      menuNote: "Italian aperitivo classic.",
      priceUsd: 11.0,
      priceLbp: 990000,
      preparationTime: 4,
      tags: ["cocktail", "aperol"],
    },
    {
      categoryName: "Italian Food",
      name: "Parmigiano",
      description: "Creamy parmesan pasta with cracked pepper.",
      menuNote: "House-signature parmesan emulsion sauce.",
      priceUsd: 23.0,
      priceLbp: 2070000,
      preparationTime: 14,
      tags: ["pasta", "signature"],
    },
    {
      categoryName: "Italian Food",
      name: "Reggiano",
      description: "Pasta finished with aged Reggiano and butter.",
      menuNote: "Uses 24-month aged Reggiano.",
      priceUsd: 24.0,
      priceLbp: 2160000,
      preparationTime: 14,
      tags: ["pasta", "reggiano"],
    },
    {
      categoryName: "Italian Food",
      name: "Spaghetti Bolognese",
      description: "Slow-cooked beef ragout over spaghetti.",
      menuNote: "Slow-cooked for 6 hours.",
      priceUsd: 18.0,
      priceLbp: 1620000,
      preparationTime: 16,
      tags: ["pasta", "beef"],
    },
    {
      categoryName: "Italian Food",
      name: "Chicken Alfredo",
      description: "Fettuccine with grilled chicken in Alfredo sauce.",
      menuNote: "Rich parmesan cream sauce.",
      priceUsd: 19.0,
      priceLbp: 1710000,
      preparationTime: 16,
      tags: ["pasta", "chicken"],
    },
    {
      categoryName: "Burgers",
      name: "Beef Burger",
      description: "Grilled beef patty, cheddar, lettuce, tomato, and sauce.",
      menuNote: "Served with fries and house sauce.",
      priceUsd: 15.0,
      priceLbp: 1350000,
      preparationTime: 12,
      tags: ["burger", "beef"],
    },
    {
      categoryName: "Burgers",
      name: "Cheese Burger",
      description: "Double cheese beef burger with pickles and caramelized onions.",
      menuNote: "Double cheddar layers with caramelized onions.",
      priceUsd: 17.0,
      priceLbp: 1530000,
      preparationTime: 12,
      tags: ["burger", "cheese", "signature"],
    },
    {
      categoryName: "Burgers",
      name: "Crispy Chicken Burger",
      description: "Buttermilk fried chicken burger with slaw.",
      menuNote: "Crispy fillet with house slaw.",
      priceUsd: 14.5,
      priceLbp: 1305000,
      preparationTime: 11,
      tags: ["burger", "chicken"],
    },
    {
      categoryName: "Pizzas",
      name: "Margherita Pizza",
      description: "San Marzano tomato, mozzarella, basil.",
      menuNote: "Classic Neapolitan style.",
      priceUsd: 13.0,
      priceLbp: 1170000,
      preparationTime: 11,
      tags: ["pizza", "vegetarian"],
    },
    {
      categoryName: "Pizzas",
      name: "Pepperoni Pizza",
      description: "Mozzarella, beef pepperoni, tomato sauce.",
      menuNote: "Best seller.",
      priceUsd: 15.0,
      priceLbp: 1350000,
      preparationTime: 12,
      tags: ["pizza", "pepperoni"],
    },
    {
      categoryName: "Pizzas",
      name: "BBQ Chicken Pizza",
      description: "Grilled chicken, BBQ sauce, onions, mozzarella.",
      menuNote: "Smoky BBQ finish.",
      priceUsd: 16.0,
      priceLbp: 1440000,
      preparationTime: 12,
      tags: ["pizza", "chicken", "bbq"],
    },
    {
      categoryName: "Pizzas",
      name: "Quattro Formaggi",
      description: "Mozzarella, gorgonzola, parmesan, and provolone.",
      menuNote: "Four-cheese premium blend.",
      priceUsd: 17.5,
      priceLbp: 1575000,
      preparationTime: 12,
      tags: ["pizza", "cheese"],
    },
    {
      categoryName: "Shisha",
      name: "Double Apple Shisha",
      description: "Traditional double apple flavor.",
      menuNote: "Classic bold anise profile.",
      priceUsd: 10.0,
      priceLbp: 900000,
      preparationTime: 6,
      tags: ["shisha", "classic"],
    },
    {
      categoryName: "Shisha",
      name: "Mint Lemon Shisha",
      description: "Fresh mint and lemon blend.",
      menuNote: "Cool and citrus-forward.",
      priceUsd: 10.5,
      priceLbp: 945000,
      preparationTime: 6,
      tags: ["shisha", "mint"],
    },
    {
      categoryName: "Shisha",
      name: "Blueberry Mint Shisha",
      description: "Blueberry sweetness balanced with mint.",
      menuNote: "Smooth fruity smoke.",
      priceUsd: 11.0,
      priceLbp: 990000,
      preparationTime: 6,
      tags: ["shisha", "blueberry"],
    },
  ],
};

async function upsertCategory({ organizationId, category, parentMap }) {
  const parentId = category.parentName ? parentMap.get(category.parentName) || null : null;
  const update = {
    organization: organizationId,
    name: category.name,
    color: category.color,
    sortOrder: category.sortOrder,
    menuNote: category.menuNote || "",
    availableFrom: category.availableFrom || "",
    availableTo: category.availableTo || "",
    parentCategory: parentId,
  };

  const existing = await Category.findOne({
    organization: organizationId,
    name: category.name,
  });

  if (existing) {
    Object.assign(existing, update);
    const saved = await existing.save();
    return { doc: saved, created: false };
  }

  const created = await Category.create(update);
  return { doc: created, created: true };
}

async function upsertMenuItem({ organizationId, item, categoryId }) {
  const legacy = toLegacyPrice(item.priceUsd, item.priceLbp);
  const update = {
    organization: organizationId,
    category: categoryId,
    name: item.name,
    description: item.description || "",
    menuNote: item.menuNote || "",
    priceUsd: Math.max(0, Number(item.priceUsd) || 0),
    priceLbp: Math.max(0, Number(item.priceLbp) || 0),
    price: legacy.price,
    currency: legacy.currency,
    preparationTime: Math.max(0, Number(item.preparationTime) || 0),
    isAvailable: item.isAvailable !== false,
    tags: Array.isArray(item.tags) ? item.tags : [],
  };

  const existing = await MenuItem.findOne({
    organization: organizationId,
    category: categoryId,
    name: item.name,
  });

  if (existing) {
    Object.assign(existing, update);
    const saved = await existing.save();
    return { doc: saved, created: false };
  }

  const created = await MenuItem.create(update);
  return { doc: created, created: true };
}

async function main() {
  const { orgSlug, replace } = parseArgs();
  await mongoose.connect(config.databaseURI);

  const org = await Organization.findOne({ slug: String(orgSlug).trim().toLowerCase() })
    .select("_id name slug")
    .lean();
  if (!org) {
    throw new Error(`Organization not found for slug "${orgSlug}".`);
  }

  console.log(`Seeding professional menu for org "${org.slug}" (${org.name})...`);
  if (replace) {
    const [deletedItems, deletedCategories] = await Promise.all([
      MenuItem.deleteMany({ organization: org._id }),
      Category.deleteMany({ organization: org._id }),
    ]);
    console.log(
      `Replace mode: deleted ${deletedItems.deletedCount} menu items and ${deletedCategories.deletedCount} categories.`
    );
  }

  const categoryIdByName = new Map();
  let categoriesCreated = 0;
  let categoriesUpdated = 0;

  const topLevel = PROFESSIONAL_MENU.categories.filter((c) => !c.parentName);
  const nested = PROFESSIONAL_MENU.categories.filter((c) => Boolean(c.parentName));

  for (const category of topLevel) {
    const { doc, created } = await upsertCategory({
      organizationId: org._id,
      category,
      parentMap: categoryIdByName,
    });
    categoryIdByName.set(category.name, doc._id);
    if (created) categoriesCreated += 1;
    else categoriesUpdated += 1;
  }

  for (const category of nested) {
    const { doc, created } = await upsertCategory({
      organizationId: org._id,
      category,
      parentMap: categoryIdByName,
    });
    categoryIdByName.set(category.name, doc._id);
    if (created) categoriesCreated += 1;
    else categoriesUpdated += 1;
  }

  let itemsCreated = 0;
  let itemsUpdated = 0;
  for (const item of PROFESSIONAL_MENU.items) {
    const categoryId = categoryIdByName.get(item.categoryName);
    if (!categoryId) {
      throw new Error(`Category "${item.categoryName}" not found while seeding "${item.name}".`);
    }
    const { created } = await upsertMenuItem({
      organizationId: org._id,
      item,
      categoryId,
    });
    if (created) itemsCreated += 1;
    else itemsUpdated += 1;
  }

  const totals = await Promise.all([
    Category.countDocuments({ organization: org._id }),
    MenuItem.countDocuments({ organization: org._id }),
  ]);
  console.log(
    [
      "Professional menu seed complete.",
      `Categories: +${categoriesCreated} created, ${categoriesUpdated} updated, ${totals[0]} total.`,
      `Items: +${itemsCreated} created, ${itemsUpdated} updated, ${totals[1]} total.`,
    ].join(" ")
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
