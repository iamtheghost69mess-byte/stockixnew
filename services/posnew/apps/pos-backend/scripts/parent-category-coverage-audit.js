#!/usr/bin/env node
/**
 * Parent category coverage audit — inventory vs accounting vs Studio.
 *
 * Prints a static checklist of known code gaps, then (if MONGODB_URI is set)
 * scans Category + MenuItem data for revenue-account inheritance issues that
 * affect GL posting today.
 *
 * Usage (from repo root or apps/pos-backend):
 *   node scripts/parent-category-coverage-audit.js
 *   MONGODB_URI=mongodb://127.0.0.1:27017/pos node scripts/parent-category-coverage-audit.js
 *
 * Optional: restrict to one org
 *   PARENT_AUDIT_ORG_ID=<24hex> MONGODB_URI=... node scripts/parent-category-coverage-audit.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const STATIC_CHECKLIST = [
  {
    area: "Accounting — sale posting",
    file: "services/categoryRevenueResolveService.js + accountingService.js (postOrderSaleLedger)",
    gap:
      "RESOLVED: Revenue buckets use `buildMenuCategoryRevenueIndex` + walk leaf→parent for first `revenueAccount` before default revenue.",
    severity: "info",
  },
  {
    area: "Accounting — populate depth",
    file: "services/accountingService.js Order.populate items.menuItem.category",
    gap:
      "Sale posting loads category chain from DB per org (no nested mongoose populate required for GL).",
    severity: "info",
  },
  {
    area: "Accounting — analytics",
    file: "services/accountingService.js postOrderSaleLedger revenue credits",
    gap:
      "RESOLVED: Revenue credits include orderSaleRevenueCategoryMix (per-leaf extensionWeight, pctOfBucketExtension, allocatedSubtotal) plus optional primary menuCategoryId/path/name (largest categorized share) and bucket index fields.",
    severity: "info",
  },
  {
    area: "Inventory — recipe / availability",
    file: "controllers/inventoryController.js (menuAvailability), services/inventoryService.js",
    gap:
      "Menu category / parentCategory not used for 86-list logic (by design). No functional gap unless you need category-scoped availability rules.",
    severity: "info",
  },
  {
    area: "Inventory — ingredient categories (separate model)",
    file: "controllers/platformMetricsController.js (inventoryValuationReport)",
    gap:
      "RESOLVED: Valuation buckets use `Parent › Leaf` when IngredientCategory has parentCategory populated.",
    severity: "info",
  },
  {
    area: "Studio API — menu items",
    file: "controllers/menuItemController.js list/get",
    gap:
      "RESOLVED: MENU_ITEM_CATEGORY_POPULATE includes parentCategory + revenueAccount for Studio.",
    severity: "info",
  },
  {
    area: "Studio API — types",
    file: "pos-frontend2 categories page + pos-catalog-api PosCategory",
    gap:
      "RESOLVED: Categories dialog supports parent, color, revenue GL; types extended.",
    severity: "info",
  },
  {
    area: "Studio — menu items grid",
    file: "pos-frontend2/src/lib/mdd/resource-config.tsx (menuItems.category column)",
    gap:
      "RESOLVED: Category column prefers API `categoryFullPath` (full tree); falls back to Parent › Leaf.",
    severity: "info",
  },
  {
    area: "Category graph integrity",
    file: "controllers/categoryController.js",
    gap:
      "RESOLVED: Create + update validate parent chain acyclicity; updates reject parentCategory that is a descendant.",
    severity: "info",
  },
];

function printStaticReport() {
  console.log("\n=== Static plan checker: parent Category coverage ===\n");
  for (const row of STATIC_CHECKLIST) {
    console.log(`[${row.severity.toUpperCase()}] ${row.area}`);
    console.log(`  Where: ${row.file}`);
    console.log(`  Gap: ${row.gap}\n`);
  }
}

function categoryMapFromLean(cats) {
  const byId = new Map();
  for (const c of cats) {
    byId.set(String(c._id), c);
  }
  return byId;
}

/** First revenueAccount walking leaf → root (same org chain). */
function inheritedRevenueAccountId(catId, byId) {
  let cur = byId.get(String(catId));
  const seen = new Set();
  while (cur && !seen.has(String(cur._id))) {
    seen.add(String(cur._id));
    const ra = cur.revenueAccount;
    if (ra) return String(ra._id || ra);
    const p = cur.parentCategory;
    if (!p) break;
    cur = byId.get(String(p._id || p));
  }
  return null;
}

function directRevenueAccountId(catId, byId) {
  const c = byId.get(String(catId));
  if (!c) return null;
  const ra = c.revenueAccount;
  return ra ? String(ra._id || ra) : null;
}

async function auditDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("\n(No MONGODB_URI — skip data scan.)\n");
    return;
  }

  const orgFilter = {};
  const rawOrg = process.env.PARENT_AUDIT_ORG_ID;
  if (rawOrg && mongoose.Types.ObjectId.isValid(String(rawOrg))) {
    orgFilter.organization = new mongoose.Types.ObjectId(String(rawOrg));
  }

  await mongoose.connect(uri);

  const Category = require("../models/categoryModel");
  const MenuItem = require("../models/menuItemModel");

  const cats = await Category.find(orgFilter)
    .select("name parentCategory revenueAccount organization")
    .lean();
  const byId = categoryMapFromLean(cats);

  const items = await MenuItem.find(orgFilter).select("name category organization").lean();

  const inheritedOnlyLeaves = [];
  for (const mi of items) {
    const cid = mi.category;
    if (!cid) continue;
    const direct = directRevenueAccountId(cid, byId);
    const inherited = inheritedRevenueAccountId(cid, byId);
    if (!inherited) continue;
    if (direct) continue;
    inheritedOnlyLeaves.push({
      menuItemName: mi.name,
      menuItemId: String(mi._id),
      organization: String(mi.organization || ""),
      inheritedRevenueAccountId: inherited,
      note:
        "Leaf category has no revenueAccount but an ancestor does — `postOrderSaleLedger` resolves revenue by walking leaf→root (see categoryRevenueResolveService). This row is informational (catalog hygiene / reporting), not a GL gap.",
    });
  }

  console.log(
    "\n=== Data scan: menu items whose leaf category has no revenueAccount but an ancestor does (informational; sale posting inherits via category map) ===\n"
  );
  if (inheritedOnlyLeaves.length === 0) {
    console.log("No rows (or no menu items / categories with revenue accounts).\n");
  } else {
    console.log(`Count: ${inheritedOnlyLeaves.length}\n`);
    for (const m of inheritedOnlyLeaves.slice(0, 50)) {
      console.log(JSON.stringify(m, null, 0));
    }
    if (inheritedOnlyLeaves.length > 50) {
      console.log(`\n... and ${inheritedOnlyLeaves.length - 50} more.\n`);
    }
  }

  await mongoose.disconnect();
}

async function main() {
  printStaticReport();
  try {
    await auditDatabase();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
}

main();
