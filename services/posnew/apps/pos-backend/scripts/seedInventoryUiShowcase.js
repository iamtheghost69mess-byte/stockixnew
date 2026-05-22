#!/usr/bin/env node
/**
 * Demo / training inventory dataset for the tenant UI (pos-frontend2 dashboards).
 *
 * Targets the same org as `npm run seed:dev` (slug **dev-org** by default), or
 * `SEED_ORG_SLUG=my-org` to pick another organization.
 *
 * Creates realistic rows so each area shows meaningful labels:
 *   - Second warehouse/location (cold store)
 *   - Ingredient categories, ingredients (SKUs = barcode-style lookup keys)
 *   - Suppliers + ingredient–supplier price rows
 *   - Stock balances + optional inter-location transfer (movements)
 *   - Menu category + dishes (availability on/off, inventory impact mix)
 *   - Recipes (BoM)
 *   - Purchase orders (draft + confirmed) + GRN (confirmed + draft)
 *   - Stock take sessions (draft + in progress)
 *   - Customer return + waste movements (inventory analytics)
 *   - Warehouse zones + bins (real shelf topology)
 *
 * Safe by default: skips if demo suppliers already exist unless `--force`.
 *
 * Usage (from apps/pos-backend):
 *   npm run seed:inventory-ui
 *   npm run seed:inventory-ui -- --force
 *   SEED_ORG_SLUG=dev-org npm run seed:inventory-ui
 *
 * Refuses production unless ALLOW_DEV_SEED=1 (same guard as seed:dev).
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const Organization = require("../models/organizationModel");
const Location = require("../models/locationModel");
const User = require("../models/userModel");
const Category = require("../models/categoryModel");
const MenuItem = require("../models/menuItemModel");
const Recipe = require("../models/recipeModel");
const IngredientCategory = require("../models/ingredientCategoryModel");
const Ingredient = require("../models/ingredientModel");
const IngredientSupplier = require("../models/ingredientSupplierModel");
const Supplier = require("../models/supplierModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const GoodsReceiptNote = require("../models/goodsReceiptNoteModel");
const StockTakeSession = require("../models/stockTakeSessionModel");
const StockMovement = require("../models/stockMovementModel");
const StockBalance = require("../models/stockBalanceModel");
const StockLot = require("../models/stockLotModel");
const IngredientPriceHistory = require("../models/ingredientPriceHistoryModel");
const Zone = require("../models/zoneModel");
const Bin = require("../models/binModel");
const stockBalanceService = require("../services/stockBalanceService");
const grnService = require("../services/grnService");

const DEMO_SUPPLIER_CODE = "DEMO-UI-SUP-FARM";
const DEMO_NOTE = "Ops scenario seed (CedarStone Pizzeria) — safe to delete with --force";
const force = process.argv.includes("--force");

function assertNotProduction() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SEED !== "1") {
    console.error(
      "seed:inventory-ui refused in production. Set ALLOW_DEV_SEED=1 if you really mean it."
    );
    process.exit(1);
  }
}

async function removePreviousDemo(orgId) {
  const menuIds = (
    await MenuItem.find({
      organization: orgId,
      name: { $regex: /^Demo UI:/ },
    })
      .select("_id")
      .lean()
  ).map((m) => m._id);
  if (menuIds.length) {
    await Recipe.deleteMany({
      organization: orgId,
      $or: [{ menuItem: { $in: menuIds } }, { "ingredients.subMenuItem": { $in: menuIds } }],
    });
    await MenuItem.deleteMany({ _id: { $in: menuIds } });
  }

  await Category.deleteMany({
    organization: orgId,
    name: { $regex: /^Demo UI:/ },
  });

  const pos = await PurchaseOrder.find({
    organization: orgId,
    reference: { $regex: /^DEMO-UI-PO-/ },
  })
    .select("_id")
    .lean();
  const poIds = pos.map((p) => p._id);
  if (poIds.length) {
    await GoodsReceiptNote.deleteMany({
      organization: orgId,
      purchaseOrder: { $in: poIds },
    });
    await PurchaseOrder.deleteMany({ _id: { $in: poIds } });
  }

  await StockTakeSession.deleteMany({
    organization: orgId,
    note: new RegExp(DEMO_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  });

  const ingIds = (
    await Ingredient.find({
      organization: orgId,
      sku: { $regex: /^DEMO-UI-/ },
    })
      .select("_id")
      .lean()
  ).map((x) => x._id);

  if (ingIds.length) {
    await StockMovement.deleteMany({
      organization: orgId,
      ingredient: { $in: ingIds },
    });
    await StockLot.deleteMany({
      organization: orgId,
      ingredient: { $in: ingIds },
    });
    await IngredientPriceHistory.deleteMany({
      organization: orgId,
      ingredient: { $in: ingIds },
    });
    await StockBalance.deleteMany({
      organization: orgId,
      ingredient: { $in: ingIds },
    });
    await IngredientSupplier.deleteMany({
      organization: orgId,
      ingredient: { $in: ingIds },
    });
    await Ingredient.deleteMany({ _id: { $in: ingIds } });
  }

  await Supplier.deleteMany({
    organization: orgId,
    code: { $regex: /^DEMO-UI-/ },
  });

  await IngredientCategory.deleteMany({
    organization: orgId,
    name: { $regex: /^Demo UI:/ },
  });

  await Location.deleteMany({
    organization: orgId,
    code: "DEMO-WH2",
  });

  const zoneIds = (
    await Zone.find({
      organization: orgId,
      name: { $regex: /^Demo UI:/ },
    })
      .select("_id")
      .lean()
  ).map((z) => z._id);
  if (zoneIds.length) {
    await Bin.deleteMany({
      organization: orgId,
      zone: { $in: zoneIds },
    });
    await Zone.deleteMany({ _id: { $in: zoneIds } });
  }

  console.log("Removed previous DEMO-UI-* showcase rows for this organization.");
}

async function main() {
  assertNotProduction();
  await mongoose.connect(config.databaseURI);

  const slug = process.env.SEED_ORG_SLUG || "dev-org";
  const org = await Organization.findOne({ slug });
  if (!org) {
    console.error(
      `No organization with slug "${slug}". Run npm run seed:dev first or set SEED_ORG_SLUG.`
    );
    process.exit(1);
  }
  const orgId = org._id;

  const exists = await Supplier.exists({
    organization: orgId,
    code: DEMO_SUPPLIER_CODE,
  });
  if (exists && !force) {
    console.log(
      `Demo inventory already present (supplier ${DEMO_SUPPLIER_CODE}). Re-run with --force to replace.`
    );
    await mongoose.disconnect();
    return;
  }

  if (force) {
    await removePreviousDemo(orgId);
  }

  const mainLoc = await Location.findOne({ organization: orgId, code: "MAIN" });
  if (!mainLoc) {
    console.error('Missing location code MAIN for this org. Run npm run seed:dev first.');
    process.exit(1);
  }

  const coldLoc = await Location.create({
    organization: orgId,
    name: "CedarStone — East Commissary Cold Store",
    code: "DEMO-WH2",
    address: "Secondary stock node for transfers and location-scoped replenishment.",
  });

  let actor = await User.findOne({ organization: orgId })
    .sort({ role: 1 })
    .select("_id")
    .lean();
  if (!actor) {
    actor = await User.findOne().select("_id").lean();
  }
  const userId = actor?._id || null;

  const icProduce = await IngredientCategory.create({
    organization: orgId,
    name: "Demo UI: Fresh produce",
    description: "Daily vegetables and herbs for prep and garnish workflows.",
    sortOrder: 10,
  });
  const icDry = await IngredientCategory.create({
    organization: orgId,
    name: "Demo UI: Dry goods and oils",
    description: "Flour, oils, and ambient pantry items used in dough and sauce production.",
    sortOrder: 20,
  });

  const ingTomato = await Ingredient.create({
    organization: orgId,
    name: "Roma tomatoes (sauce prep)",
    sku: "DEMO-UI-TOM-001",
    description: "Stocked in grams for sauce prep and waste analytics training.",
    category: icProduce._id,
    unit: "g",
    currentStock: 0,
    reorderThreshold: 800,
    reorderQuantity: 2000,
    unitCost: 0.002,
    averageUnitCost: 0.002,
  });
  const ingOil = await Ingredient.create({
    organization: orgId,
    name: "Extra virgin olive oil",
    sku: "DEMO-UI-OIL-001",
    category: icDry._id,
    unit: "ml",
    currentStock: 0,
    reorderThreshold: 400,
    reorderQuantity: 2000,
    unitCost: 0.0015,
    averageUnitCost: 0.0015,
  });
  const ingFlour = await Ingredient.create({
    organization: orgId,
    name: "Pizza flour 00",
    sku: "DEMO-UI-FLR-001",
    category: icDry._id,
    unit: "g",
    currentStock: 0,
    reorderThreshold: 2000,
    reorderQuantity: 10000,
    unitCost: 0.0008,
    averageUnitCost: 0.0008,
  });
  const ingMozz = await Ingredient.create({
    organization: orgId,
    name: "Fresh mozzarella",
    sku: "DEMO-UI-BC-SCAN-999",
    description: "Scan SKU DEMO-UI-BC-SCAN-999 in barcode lookup to test receiving/returns flows.",
    category: icProduce._id,
    unit: "g",
    currentStock: 0,
    reorderThreshold: 400,
    reorderQuantity: 1500,
    unitCost: 0.012,
    averageUnitCost: 0.012,
  });
  const ingBasil = await Ingredient.create({
    organization: orgId,
    name: "Fresh basil bunch",
    sku: "DEMO-UI-BSL-001",
    category: icProduce._id,
    unit: "piece",
    currentStock: 0,
    reorderThreshold: 5,
    reorderQuantity: 20,
    unitCost: 0.35,
    averageUnitCost: 0.35,
  });

  const supFarm = await Supplier.create({
    organization: orgId,
    name: "Green Valley Produce Co-op",
    code: DEMO_SUPPLIER_CODE,
    phone: "+1-555-0100",
    email: "demo.farms@example.com",
    notes: "Primary produce supplier for weekly prep cycles.",
    defaultLeadTimeDays: 2,
    status: "active",
  });
  const supImport = await Supplier.create({
    organization: orgId,
    name: "Levant Food Imports",
    code: "DEMO-UI-SUP-MED",
    phone: "+1-555-0101",
    notes: "Dry goods and olive oil importer with 5-day lead time.",
    defaultLeadTimeDays: 5,
    status: "active",
  });

  await IngredientSupplier.create({
    organization: orgId,
    ingredient: ingTomato._id,
    supplier: supFarm._id,
    unitPrice: 0.0022,
    minimumOrderQty: 500,
    leadTimeDays: 2,
    isPreferred: true,
    supplierSku: "FARM-TOM-5KG",
    notes: "Preferred tomato vendor.",
  });
  await IngredientSupplier.create({
    organization: orgId,
    ingredient: ingOil._id,
    supplier: supImport._id,
    unitPrice: 0.0016,
    leadTimeDays: 5,
    isPreferred: true,
    supplierSku: "MED-EVOO-5L",
  });
  await IngredientSupplier.create({
    organization: orgId,
    ingredient: ingFlour._id,
    supplier: supImport._id,
    unitPrice: 0.0009,
    isPreferred: true,
  });

  const mainId = String(mainLoc._id);
  const coldId = String(coldLoc._id);

  const zReceiving = await Zone.create({
    organization: orgId,
    location: mainLoc._id,
    name: "Demo UI: Main receiving dock",
    description: "Inbound supplier deliveries, GRN checks, lot labeling, and quality hold.",
    zoneType: "receiving",
    status: "active",
  });
  const zCold = await Zone.create({
    organization: orgId,
    location: mainLoc._id,
    name: "Demo UI: Cold room A",
    description: "Perishables (dairy and produce) under FEFO handling.",
    zoneType: "bulk",
    status: "active",
  });
  const zDry = await Zone.create({
    organization: orgId,
    location: mainLoc._id,
    name: "Demo UI: Dry storage B",
    description: "Flour, oils, packaging, and reserve stock for weekend peaks.",
    zoneType: "picking",
    status: "active",
  });
  const zArchive = await Zone.create({
    organization: orgId,
    location: coldLoc._id,
    name: "Demo UI: Legacy overflow",
    description: "Archived zone for status/filter training in warehouse screens.",
    zoneType: "staging",
    status: "archived",
  });

  await Bin.insertMany([
    {
      organization: orgId,
      zone: zReceiving._id,
      name: "Dock lane 1",
      description: "Pallet staging lane for inbound PO unloading.",
      binType: "standard",
      capacity: 50,
      pickPriority: 10,
      status: "active",
    },
    {
      organization: orgId,
      zone: zCold._id,
      name: "Rack C1",
      description: "Cheese and dairy rack with FIFO date labels.",
      binType: "cold_storage",
      capacity: 800,
      pickPriority: 1,
      status: "active",
    },
    {
      organization: orgId,
      zone: zCold._id,
      name: "Rack C2",
      description: "Fresh produce overflow for prep and dispatch team.",
      binType: "cold_storage",
      capacity: 1200,
      pickPriority: 2,
      status: "active",
    },
    {
      organization: orgId,
      zone: zDry._id,
      name: "Shelf B-03",
      description: "Dry goods pick face for fast-moving ingredients.",
      binType: "standard",
      capacity: 2000,
      pickPriority: 1,
      status: "active",
    },
    {
      organization: orgId,
      zone: zArchive._id,
      name: "Overflow Z9",
      description: "Archived sample bin used for warehouse training.",
      binType: "oversize",
      capacity: 1000,
      pickPriority: 99,
      status: "archived",
    },
  ]);

  await stockBalanceService.applyQuantityDelta(mainId, ingTomato._id, 1500);
  await stockBalanceService.applyQuantityDelta(mainId, ingOil._id, 2500);
  await stockBalanceService.applyQuantityDelta(mainId, ingFlour._id, 8000);
  await stockBalanceService.applyQuantityDelta(mainId, ingMozz._id, 900);
  await stockBalanceService.applyQuantityDelta(mainId, ingBasil._id, 12);
  await stockBalanceService.applyQuantityDelta(coldId, ingTomato._id, 400);
  await stockBalanceService.applyQuantityDelta(coldId, ingMozz._id, 200);

  await stockBalanceService.transferQuantity({
    fromLocationId: mainId,
    toLocationId: coldId,
    ingredientId: ingFlour._id,
    quantity: 500,
    userId,
    note: "Night transfer to commissary cold store for morning prep (transfer in/out trace).",
    organizationId: orgId,
  });

  const movRet = await stockBalanceService.applyQuantityDelta(mainId, ingMozz._id, 120);
  await StockMovement.create({
    organization: orgId,
    ingredient: ingMozz._id,
    delta: 120,
    balanceAfter: movRet.totalStock,
    reason: "customer_return",
    note: "Customer returned sealed mozzarella; quantity restocked under customer_return.",
    user: userId,
    location: mainLoc._id,
  });

  const movWaste = await stockBalanceService.applyQuantityDelta(mainId, ingTomato._id, -150);
  await StockMovement.create({
    organization: orgId,
    ingredient: ingTomato._id,
    delta: -150,
    balanceAfter: movWaste.totalStock,
    reason: "waste",
    note: "Spoiled tomato batch discarded after quality check (waste analytics scenario).",
    wasteReasonCode: "damaged",
    user: userId,
    location: mainLoc._id,
  });

  const menuCat = await Category.create({
    organization: orgId,
    name: "Demo UI: Signature pizzas",
    color: "#b45309",
  });

  const miMargherita = await MenuItem.create({
    organization: orgId,
    name: "Margherita pizza",
    description: "Core seller with full BoM; used for stock deduction and availability testing.",
    price: 12.5,
    category: menuCat._id,
    isAvailable: true,
    preparationTime: 12,
    inventoryImpact: "stockable",
  });
  const miSalad = await MenuItem.create({
    organization: orgId,
    name: "House side salad",
    description: "Low-cost stockable item used for menu availability comparisons.",
    price: 6,
    category: menuCat._id,
    isAvailable: true,
    inventoryImpact: "stockable",
  });
  await MenuItem.create({
    organization: orgId,
    name: "Sparkling water (330ml)",
    description: "Consumable impact item for reporting without on-hand stock deduction.",
    price: 3,
    category: menuCat._id,
    isAvailable: true,
    inventoryImpact: "consumable",
  });
  const miTruffle = await MenuItem.create({
    organization: orgId,
    name: "Truffle special (seasonal)",
    description: "Disabled menu item to demonstrate off-menu availability behavior.",
    price: 22,
    category: menuCat._id,
    isAvailable: false,
    inventoryImpact: "stockable",
  });

  await Recipe.create({
    organization: orgId,
    menuItem: miMargherita._id,
    ingredients: [
      { ingredient: ingFlour._id, quantity: 220 },
      { ingredient: ingTomato._id, quantity: 90 },
      { ingredient: ingMozz._id, quantity: 110 },
      { ingredient: ingOil._id, quantity: 8 },
      { ingredient: ingBasil._id, quantity: 0.25 },
    ],
  });
  await Recipe.create({
    organization: orgId,
    menuItem: miSalad._id,
    ingredients: [
      { ingredient: ingTomato._id, quantity: 40 },
      { ingredient: ingOil._id, quantity: 15 },
    ],
  });
  await Recipe.create({
    organization: orgId,
    menuItem: miTruffle._id,
    ingredients: [
      { ingredient: ingMozz._id, quantity: 140 },
      { ingredient: ingOil._id, quantity: 10 },
    ],
  });

  const poDraft = await PurchaseOrder.create({
    organization: orgId,
    reference: "DEMO-UI-PO-WEEKLY-DRAFT",
    supplier: supFarm._id,
    location: mainLoc._id,
    status: "draft",
    notes: "Weekly produce draft PO pending manager confirmation.",
    lines: [
      {
        ingredient: ingBasil._id,
        description: "Bunches for weekend rush",
        quantityOrdered: 30,
        quantityReceived: 0,
        unitCost: 0.32,
      },
    ],
  });

  const poReceive = await PurchaseOrder.create({
    organization: orgId,
    reference: "DEMO-UI-PO-IMPORTED-OIL",
    supplier: supImport._id,
    location: mainLoc._id,
    status: "draft",
    expectedAt: new Date(Date.now() + 5 * 86400000),
    notes: "Confirmed PO; GRN confirmation should post stock and clear incoming quantities.",
    lines: [
      {
        ingredient: ingOil._id,
        description: "5L tins",
        quantityOrdered: 3000,
        quantityReceived: 0,
        unitCost: 0.00155,
      },
    ],
  });
  poReceive.status = "confirmed";
  await poReceive.save();
  for (const line of poReceive.lines) {
    const qo = Number(line.quantityOrdered) || 0;
    if (qo > 0) {
      await stockBalanceService.applyIncomingDelta(mainId, line.ingredient, qo);
    }
  }

  const grn1 = await grnService.createGRNFromPO(poReceive._id, orgId, userId);
  const exp = new Date();
  exp.setMonth(exp.getMonth() + 6);
  const gLine = grn1.lines[0];
  gLine.quantityReceived = 3000;
  gLine.unitCost = 0.00155;
  gLine.lotNumber = "DEMO-LOT-EVOO-01";
  gLine.expiryDate = exp;
  gLine.productionDate = new Date();
  gLine.supplierBatchRef = "MED-BATCH-7788";
  await grn1.save();
  await grnService.confirmGRN(grn1._id, orgId, userId, null);

  const poPartial = await PurchaseOrder.create({
    organization: orgId,
    reference: "DEMO-UI-PO-TOMATO-PARTIAL",
    supplier: supFarm._id,
    location: mainLoc._id,
    status: "draft",
    lines: [
      {
        ingredient: ingTomato._id,
        description: "Cases 5kg",
        quantityOrdered: 5000,
        quantityReceived: 0,
        unitCost: 0.0021,
      },
    ],
  });
  poPartial.status = "confirmed";
  await poPartial.save();
  for (const line of poPartial.lines) {
    const qo = Number(line.quantityOrdered) || 0;
    if (qo > 0) {
      await stockBalanceService.applyIncomingDelta(mainId, line.ingredient, qo);
    }
  }
  const grnDraft = await grnService.createGRNFromPO(poPartial._id, orgId, userId);
  const gl2 = grnDraft.lines[0];
  gl2.quantityReceived = 1200;
  gl2.unitCost = 0.0021;
  gl2.lotNumber = "DEMO-LOT-TOM-02";
  gl2.expiryDate = new Date(Date.now() + 4 * 86400000);
  await grnDraft.save();

  const sysTomato = await StockBalance.findOne({
    organization: orgId,
    location: mainLoc._id,
    ingredient: ingTomato._id,
  }).lean();
  const sysMozz = await StockBalance.findOne({
    organization: orgId,
    location: mainLoc._id,
    ingredient: ingMozz._id,
  }).lean();

  await StockTakeSession.create({
    organization: orgId,
    location: mainLoc._id,
    status: "draft",
    note: DEMO_NOTE,
    createdBy: userId,
    lines: [
      {
        ingredient: ingTomato._id,
        systemQty: Number(sysTomato?.quantity) || 0,
        countedQty: null,
      },
      {
        ingredient: ingMozz._id,
        systemQty: Number(sysMozz?.quantity) || 0,
        countedQty: null,
      },
    ],
  });

  const flourBal = await StockBalance.findOne({
    organization: orgId,
    location: mainLoc._id,
    ingredient: ingFlour._id,
  }).lean();
  const oilBal = await StockBalance.findOne({
    organization: orgId,
    location: mainLoc._id,
    ingredient: ingOil._id,
  }).lean();

  await StockTakeSession.create({
    organization: orgId,
    location: mainLoc._id,
    status: "in_progress",
    note: `${DEMO_NOTE} — in progress with sample counts.`,
    createdBy: userId,
    lines: [
      {
        ingredient: ingFlour._id,
        systemQty: Number(flourBal?.quantity) || 0,
        countedQty: 7950,
      },
      {
        ingredient: ingOil._id,
        systemQty: Number(oilBal?.quantity) || 0,
        countedQty: null,
      },
    ],
  });

  console.log("\n=== Demo inventory UI seed complete ===");
  console.log(`Organization slug: ${slug} (${String(orgId)})`);
  console.log("Scenario: CedarStone Pizzeria inventory operations (urban multi-branch)");
  console.log(`Locations: MAIN + ${coldLoc.name} (${coldLoc.code})`);
  console.log("Warehouse zones/bins: receiving, cold room, dry storage, and archived overflow examples");
  console.log(`Suppliers: ${supFarm.name}, ${supImport.name}`);
  console.log(
    `Purchase orders: draft #${poDraft._id} (DEMO-UI-PO-WEEKLY-DRAFT), received via GRN (DEMO-UI-PO-IMPORTED-OIL), partial + draft GRN (DEMO-UI-PO-TOMATO-PARTIAL / GRN ${grnDraft._id})`
  );
  console.log(`Barcode-style SKU to try: DEMO-UI-BC-SCAN-999 (mozzarella)`);
  console.log(`Menu: Margherita / Salad / Water / Truffle (last is unavailable)`);
  console.log(
    "Scenario map: Ingredients + categories + suppliers + POs + GRNs + recipes + returns + waste + stock takes + warehouse."
  );
  console.log("Re-run with --force to remove and recreate this demo dataset.\n");

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
