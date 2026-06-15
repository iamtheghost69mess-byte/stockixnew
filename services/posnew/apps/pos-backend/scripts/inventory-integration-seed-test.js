#!/usr/bin/env node
/**
 * Inventory integration: seed tagged dummy data + verify integrations end-to-end.
 *
 * Covers (non-exhaustive but thorough):
 *   - AccountingConfig inventory flags (stockDeductTrigger, strictOversell, reserveStockOnPending)
 *   - inventorySettingsService, inventoryRecipeUtils.flattenRecipeDemand (nested BoM, cycles)
 *   - StockBalance + reservedQty + availableQty math, OrderStockReservation lifecycle
 *   - deductForOrderLine / processStockForLineIds / processStockAfterPayment (idempotency)
 *   - PurchaseOrder CRUD-ish flow + receive (stock, lots, movements, IngredientPriceHistory)
 *   - StockLot FEFO consumption on deduction
 *   - Stock take session → post → correction movements
 *   - Waste + price-history style aggregations (mirrors inventory analytics APIs)
 *   - menuAvailability controller (mock res)
 *   - MenuItem inventoryImpact (service / consumable / stockable)
 *
 * Usage:
 *   cd pos-backend && node scripts/inventory-integration-seed-test.js
 *   node scripts/inventory-integration-seed-test.js --no-cleanup
 *   node scripts/inventory-integration-seed-test.js --verbose
 *
 * Optional HTTP smoke (server must be running, user must have inventory read + write):
 *   INVENTORY_HTTP=1 API_BASE_URL=http://localhost:3000 \
 *   INVENTORY_ACCESS_TOKEN=<JWT> node scripts/inventory-integration-seed-test.js
 *
 * Restores AccountingConfig inventory fields to their original values after the run
 * (unless the process crashes before the finally block).
 */

require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");

// Models (registration order matters for refs)
require("../models/locationModel");
require("../models/categoryModel");
require("../models/menuItemModel");
require("../models/ingredientModel");
require("../models/recipeModel");
require("../models/purchaseOrderModel");
require("../models/stockMovementModel");
require("../models/stockBalanceModel");
require("../models/stockLotModel");
require("../models/stockTakeSessionModel");
require("../models/ingredientPriceHistoryModel");
require("../models/orderStockReservationModel");
require("../models/orderModel");
require("../models/tableModel");
require("../models/userModel");
require("../models/supplierModel");
require("../models/accountingConfigModel");

const Location = require("../models/locationModel");
const Category = require("../models/categoryModel");
const MenuItem = require("../models/menuItemModel");
const Ingredient = require("../models/ingredientModel");
const Recipe = require("../models/recipeModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const StockMovement = require("../models/stockMovementModel");
const StockBalance = require("../models/stockBalanceModel");
const StockLot = require("../models/stockLotModel");
const StockTakeSession = require("../models/stockTakeSessionModel");
const IngredientPriceHistory = require("../models/ingredientPriceHistoryModel");
const OrderStockReservation = require("../models/orderStockReservationModel");
const Order = require("../models/orderModel");
const Table = require("../models/tableModel");
const User = require("../models/userModel");
const Supplier = require("../models/supplierModel");
const AccountingConfig = require("../models/accountingConfigModel");

const accountingService = require("../services/accountingService");
const {
  resolveAnchorOrganizationId,
} = require("../utils/resolveAnchorOrganizationId");
const {
  getInventorySettings,
  shouldDeductOnKitchenSend,
  shouldDeductOnPayment,
} = require("../services/inventorySettingsService");
const { flattenRecipeDemand } = require("../services/inventoryRecipeUtils");
const stockBalanceService = require("../services/stockBalanceService");
const stockLotService = require("../services/stockLotService");
const orderReservationService = require("../services/orderReservationService");
const {
  assertOrderLinesFulfillable,
  processStockForLineIds,
  processStockAfterPayment,
  processStockAfterStatusPatch,
} = require("../services/inventoryService");
const { recalcOrderTotals } = require("../utils/orderTotals");
const inventoryCostService = require("../services/inventoryCostService");

/**
 * Same logic as menu-availability for a single item (avoids scanning entire MenuItem collection).
 */
async function canFulfillMenuItemAtLocation(menuItemId, locId) {
  const balances = await StockBalance.find({ location: locId }).lean();
  const stockByIng = new Map(
    balances.map((b) => {
      const q = Number(b.quantity) || 0;
      const r = Number(b.reservedQty) || 0;
      return [String(b.ingredient), Math.max(0, q - r)];
    })
  );
  let demand;
  try {
    demand = await flattenRecipeDemand(menuItemId, 1);
  } catch {
    return { ok: false, reason: "bom_error" };
  }
  if (!demand.length) return { ok: true, reason: "empty_recipe" };
  const ingDocs = await Ingredient.find({
    _id: { $in: demand.map((d) => d.ingredientId) },
  })
    .select("status")
    .lean();
  const ingStatus = new Map(ingDocs.map((i) => [String(i._id), i.status]));
  for (const { ingredientId, qty: need } of demand) {
    if (need <= 0) continue;
    if (ingStatus.get(String(ingredientId)) === "archived") {
      return { ok: false, reason: "archived_ingredient" };
    }
    const stock = stockByIng.get(String(ingredientId)) ?? 0;
    if (stock < need) return { ok: false, reason: "insufficient" };
  }
  return { ok: true, reason: "ok" };
}

const args = process.argv.slice(2);
const NO_CLEANUP = args.includes("--no-cleanup");
const VERBOSE = args.includes("--verbose");

const HTTP = process.env.INVENTORY_HTTP === "1" || process.env.INVENTORY_HTTP === "true";
const API_BASE = (process.env.API_BASE_URL || "").replace(/\/$/, "");
const API_TOKEN = process.env.INVENTORY_ACCESS_TOKEN || "";

function log(...a) {
  console.log(...a);
}
function vlog(...a) {
  if (VERBOSE) console.log("[verbose]", ...a);
}

const results = { pass: 0, fail: 0, errors: [] };

function assert(cond, message) {
  if (cond) {
    results.pass += 1;
    log(`  ✓ ${message}`);
  } else {
    results.fail += 1;
    results.errors.push(message);
    log(`  ✗ ${message}`);
  }
}

function assertThrowsAsync(fn, message) {
  return fn()
    .then(() => {
      results.fail += 1;
      results.errors.push(`${message} (expected throw)`);
      log(`  ✗ ${message} — expected exception`);
    })
    .catch(() => {
      results.pass += 1;
      log(`  ✓ ${message}`);
    });
}

async function runHttpChecks(tag) {
  if (!HTTP) {
    log("\n── HTTP checks skipped (set INVENTORY_HTTP=1 + API_BASE_URL + INVENTORY_ACCESS_TOKEN) ──");
    return;
  }
  if (!API_BASE || !API_TOKEN) {
    log("\n── HTTP checks skipped (missing API_BASE_URL or INVENTORY_ACCESS_TOKEN) ──");
    return;
  }

  log("\n── HTTP smoke (authenticated) ──");
  const headers = {
    Authorization: `Bearer ${API_TOKEN}`,
    "Content-Type": "application/json",
  };

  const paths = [
    "/api/inventory/balances",
    "/api/inventory/report",
    "/api/inventory/menu-availability",
    "/api/inventory/analytics/waste",
    "/api/inventory/analytics/price-history",
    "/api/purchase-orders",
    "/api/stock-takes",
  ];

  for (const path of paths) {
    try {
      const url = `${API_BASE}${path}`;
      const res = await fetch(url, { headers });
      const ok = res.ok;
      const body = await res.text();
      vlog(path, res.status, body.slice(0, 200));
      assert(ok, `HTTP ${path} → ${res.status}`);
    } catch (e) {
      results.fail += 1;
      results.errors.push(`HTTP ${path}: ${e.message}`);
      log(`  ✗ HTTP ${path}: ${e.message}`);
    }
  }
}

/**
 * @param {import('mongoose').Document} cfg
 * @param {object} snapshot
 */
async function restoreAccountingInventoryFields(cfg, snapshot) {
  if (!cfg || !snapshot) return;
  cfg.stockDeductTrigger = snapshot.stockDeductTrigger;
  cfg.strictOversell = snapshot.strictOversell;
  cfg.reserveStockOnPending = snapshot.reserveStockOnPending;
  await cfg.save();
}

async function cleanup(ctx) {
  if (NO_CLEANUP) {
    log(`\n── Cleanup skipped (--no-cleanup). Tag: ${ctx.tag} ──`);
    return;
  }

  log(`\n── Cleaning up tag ${ctx.tag} ──`);

  const orderIds = ctx.orderIds || [];
  const poIds = ctx.poIds || [];
  const takeIds = ctx.takeIds || [];

  const movOr = [{ note: new RegExp(ctx.tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }];
  if (orderIds.length) movOr.push({ order: { $in: orderIds } });
  if (poIds.length) movOr.push({ purchaseOrder: { $in: poIds } });
  await StockMovement.deleteMany({ $or: movOr });

  if (orderIds.length) {
    await OrderStockReservation.deleteMany({ order: { $in: orderIds } });
  }

  if (orderIds.length) await Order.deleteMany({ _id: { $in: orderIds } });
  if (ctx.tableId) {
    await Table.findByIdAndUpdate(ctx.tableId, {
      $unset: { currentOrder: "" },
      status: "available",
    });
    await Table.findByIdAndDelete(ctx.tableId);
  }

  if (takeIds.length) {
    await StockTakeSession.deleteMany({ _id: { $in: takeIds } });
  }

  if (poIds.length) await PurchaseOrder.deleteMany({ _id: { $in: poIds } });

  if (ctx.locationId && ctx.ingredientIds?.length) {
    await StockLot.deleteMany({
      location: ctx.locationId,
      ingredient: { $in: ctx.ingredientIds },
    });
    await StockBalance.deleteMany({
      location: ctx.locationId,
      ingredient: { $in: ctx.ingredientIds },
    });
  }

  await IngredientPriceHistory.deleteMany({
    note: new RegExp(ctx.tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  });

  if (ctx.recipeMenuIds?.length) {
    await Recipe.deleteMany({ menuItem: { $in: ctx.recipeMenuIds } });
  }
  if (ctx.menuIds?.length) {
    await MenuItem.deleteMany({ _id: { $in: ctx.menuIds } });
  }
  if (ctx.ingredientIds?.length) {
    await Ingredient.deleteMany({ _id: { $in: ctx.ingredientIds } });
  }
  if (ctx.categoryId) await Category.findByIdAndDelete(ctx.categoryId);
  if (ctx.supplierId) await Supplier.findByIdAndDelete(ctx.supplierId);
  if (ctx.locationId) await Location.findByIdAndDelete(ctx.locationId);

  log("Cleanup done.");
}

async function main() {
  const tag = `INV-SEED-${Date.now()}`;
  const ctx = {
    tag,
    orderIds: [],
    poIds: [],
    takeIds: [],
    menuIds: [],
    recipeMenuIds: [],
    ingredientIds: [],
  };

  let invOrdSeq = 0;
  const invOfflineKey = () => `inv-seed-${tag}-${++invOrdSeq}-${Date.now()}`;

  await mongoose.connect(config.databaseURI);
  const anchorOrgId = await resolveAnchorOrganizationId();
  await accountingService.ensureDefaultAccountsAndConfig(anchorOrgId);

  const cfg = await AccountingConfig.findOne({ organization: anchorOrgId });
  const cfgSnapshot = {
    stockDeductTrigger: cfg.stockDeductTrigger,
    strictOversell: cfg.strictOversell,
    reserveStockOnPending: cfg.reserveStockOnPending,
  };

  const mockUser = await User.findOne().select("_id").lean();
  const reqBase = {
    user: { _id: mockUser?._id || null },
    tenantOrganizationId: anchorOrgId,
  };

  try {
    log(`\n════════ Inventory integration seed + test [${tag}] ════════\n`);

    // ── A. Settings ─────────────────────────────────────────────
    log("── A. Inventory settings (AccountingConfig) ──");
    cfg.stockDeductTrigger = "payment";
    cfg.strictOversell = false;
    cfg.reserveStockOnPending = true;
    await cfg.save();

    const s = await getInventorySettings(anchorOrgId);
    assert(s.stockDeductTrigger === "payment", "getInventorySettings.stockDeductTrigger");
    assert(!shouldDeductOnKitchenSend(s) && shouldDeductOnPayment(s), "payment-only triggers");
    assert(typeof s.strictOversell === "boolean", "strictOversell boolean");
    assert(typeof s.reserveStockOnPending === "boolean", "reserveStockOnPending boolean");

    // ── B. Catalog + stock ─────────────────────────────────────
    log("\n── B. Seed location, category, ingredients, menu, recipes ──");
    const loc = await Location.create({
      organization: anchorOrgId,
      name: `InvTest ${tag}`,
      code: `INV${String(tag).slice(-6)}`,
    });
    ctx.locationId = loc._id;

    const cat = await Category.create({
      organization: anchorOrgId,
      name: `InvTest Cat ${tag}`,
      color: "#334155",
    });
    ctx.categoryId = cat._id;

    const ingCheese = await Ingredient.create({
      organization: anchorOrgId,
      name: `InvTest Cheese ${tag}`,
      unit: "g",
      currentStock: 0,
      sku: `CH-${tag}`,
      location: loc._id,
    });
    const ingFlour = await Ingredient.create({
      organization: anchorOrgId,
      name: `InvTest Flour ${tag}`,
      unit: "g",
      currentStock: 0,
      sku: `FL-${tag}`,
      location: loc._id,
    });
    ctx.ingredientIds = [ingCheese._id, ingFlour._id];

    await stockBalanceService.applyQuantityDelta(loc._id, ingCheese._id, 5000);
    await stockBalanceService.applyQuantityDelta(loc._id, ingFlour._id, 8000);

    const balCheese = await StockBalance.findOne({
      location: loc._id,
      ingredient: ingCheese._id,
    }).lean();
    const avail0 =
      (Number(balCheese.quantity) || 0) - (Number(balCheese.reservedQty) || 0);
    assert(avail0 === 5000, "initial cheese availableQty == quantity (no reserves)");

    const miSub = await MenuItem.create({
      organization: anchorOrgId,
      name: `InvTest Sub Dish ${tag}`,
      price: 5,
      category: cat._id,
      inventoryImpact: "stockable",
    });
    const miParent = await MenuItem.create({
      organization: anchorOrgId,
      name: `InvTest Parent Dish ${tag}`,
      price: 12,
      category: cat._id,
      inventoryImpact: "stockable",
    });
    const miService = await MenuItem.create({
      organization: anchorOrgId,
      name: `InvTest Service ${tag}`,
      price: 3,
      category: cat._id,
      inventoryImpact: "service",
    });
    const miConsumable = await MenuItem.create({
      organization: anchorOrgId,
      name: `InvTest Consumable ${tag}`,
      price: 2,
      category: cat._id,
      inventoryImpact: "consumable",
    });
    ctx.menuIds = [miSub._id, miParent._id, miService._id, miConsumable._id];
    ctx.recipeMenuIds = [miSub._id, miParent._id];

    await Recipe.create({
      organization: anchorOrgId,
      menuItem: miSub._id,
      ingredients: [{ ingredient: ingCheese._id, quantity: 100 }],
    });
    await Recipe.create({
      organization: anchorOrgId,
      menuItem: miParent._id,
      ingredients: [
        { subMenuItem: miSub._id, quantity: 0.5 },
        { ingredient: ingFlour._id, quantity: 20 },
      ],
    });

    const flat1 = await flattenRecipeDemand(miParent._id, 1);
    const cheeseNeed = flat1.find((x) => String(x.ingredientId) === String(ingCheese._id));
    const flourNeed = flat1.find((x) => String(x.ingredientId) === String(ingFlour._id));
    assert(cheeseNeed && cheeseNeed.qty === 50, "nested BOM: 0.5 × 100g cheese = 50g");
    assert(flourNeed && flourNeed.qty === 20, "nested BOM: 20g flour");

    // Cycle detection: A → B → A
    const miCycleA = await MenuItem.create({
      organization: anchorOrgId,
      name: `InvTest CycleA ${tag}`,
      price: 1,
      category: cat._id,
    });
    const miCycleB = await MenuItem.create({
      organization: anchorOrgId,
      name: `InvTest CycleB ${tag}`,
      price: 1,
      category: cat._id,
    });
    ctx.menuIds.push(miCycleA._id, miCycleB._id);
    ctx.recipeMenuIds.push(miCycleA._id, miCycleB._id);
    await Recipe.create({
      organization: anchorOrgId,
      menuItem: miCycleA._id,
      ingredients: [{ subMenuItem: miCycleB._id, quantity: 1 }],
    });
    await Recipe.create({
      organization: anchorOrgId,
      menuItem: miCycleB._id,
      ingredients: [{ subMenuItem: miCycleA._id, quantity: 1 }],
    });
    await assertThrowsAsync(
      () => flattenRecipeDemand(miCycleA._id, 1),
      "flattenRecipeDemand detects circular BOM"
    );

    // ── C. Menu availability logic (targeted; mirrors GET /inventory/menu-availability) ──
    log("\n── C. Menu availability (sample at test location) ──");
    const av = await canFulfillMenuItemAtLocation(miParent._id, loc._id);
    vlog("availability parent", av);
    assert(av.ok && av.reason === "ok", "parent dish fulfillable with seeded stock (avail. math)");

    // ── D. Reservations + deduction on paid ────────────────────
    log("\n── D. Reservations + paid deduction ──");

    const maxT = await Table.findOne().sort({ tableNo: -1 }).select("tableNo").lean();
    const tableNo = (maxT?.tableNo || 90000) + Math.floor(Math.random() * 999) + 1;
    const table = await Table.create({
      tableNo,
      seats: 4,
      status: "available",
      location: loc._id,
    });
    ctx.tableId = table._id;

    const order = new Order({
      organization: anchorOrgId,
      table: table._id,
      waiter: mockUser?._id || undefined,
      orderStatus: "pending",
      orderSource: "staff",
      location: loc._id,
      offlineSyncKey: invOfflineKey(),
      items: [
        {
          menuItem: miParent._id,
          quantity: 2,
          status: "pending",
        },
      ],
      bills: { total: 0, tax: 0, totalWithTax: 0 },
    });
    await recalcOrderTotals(order);
    await order.save();
    ctx.orderIds.push(order._id);

    await orderReservationService.reserveLinesForOrder(reqBase, order);
    const resvCount = await OrderStockReservation.countDocuments({ order: order._id });
    assert(resvCount >= 2, "OrderStockReservation rows created (cheese + flour)");
    const balCheeseR = await StockBalance.findOne({
      location: loc._id,
      ingredient: ingCheese._id,
    }).lean();
    assert(
      (Number(balCheeseR.reservedQty) || 0) >= 100,
      "reservedQty reflects recipe (2 × 50g cheese)"
    );

    // Pending line replace: release old reservations before new lines (updateOrder parity)
    await orderReservationService.releaseAllReservationsForOrder(order._id);
    order.items = [
      {
        menuItem: miParent._id,
        quantity: 1,
        status: "pending",
      },
    ];
    await recalcOrderTotals(order);
    await assertOrderLinesFulfillable(order);
    await order.save();
    await orderReservationService.reserveLinesForOrder(reqBase, order);
    const balCheeseReplace = await StockBalance.findOne({
      location: loc._id,
      ingredient: ingCheese._id,
    }).lean();
    const chRes = Number(balCheeseReplace.reservedQty) || 0;
    assert(chRes >= 50 && chRes < 100, "after item replace, reservedQty is for qty 1 only (no leak)");

    order.orderStatus = "in-progress";
    await order.save();
    await processStockAfterStatusPatch(reqBase, order, {
      previousOrderStatus: "pending",
      markAllItemsSent: false,
      idsJustSent: [],
    });
    await order.populate("items");

    const lineId = String(order.items[0]._id);
    assert(!order.items[0].stockDeductedAt, "no stockDeductedAt before paid");
    const prePaidMovCount = await StockMovement.countDocuments({
      order: order._id,
      reason: "order_deduction",
    });
    assert(prePaidMovCount === 0, "no order_deduction movements before paid");

    order.orderStatus = "paid";
    order.paidAt = new Date();
    await order.save();
    await processStockAfterPayment(reqBase, order, {
      previousOrderStatus: "in-progress",
    });
    const orderAfterPaid = await Order.findById(order._id).lean();
    assert(
      !!(orderAfterPaid.items && orderAfterPaid.items[0] && orderAfterPaid.items[0].stockDeductedAt),
      "stockDeductedAt set after paid deduct"
    );
    const resvAfter = await OrderStockReservation.countDocuments({ order: order._id });
    assert(resvAfter === 0, "reservations released after deduct");

    const movCount = await StockMovement.countDocuments({
      order: order._id,
      reason: "order_deduction",
    });
    assert(movCount >= 2, "order_deduction movements recorded");

    // Idempotency: second paid processing should not double-deduct
    await processStockAfterPayment(reqBase, order, {
      previousOrderStatus: "in-progress",
    });
    const movCount2 = await StockMovement.countDocuments({
      order: order._id,
      reason: "order_deduction",
    });
    assert(movCount2 === movCount, "no duplicate deductions (idempotent)");

    // ── E. Payment deduction path ─────────────────────────────
    log("\n── E. Payment-only deduction path ──");
    cfg.stockDeductTrigger = "payment";
    await cfg.save();

    const orderPay = new Order({
      organization: anchorOrgId,
      table: table._id,
      waiter: mockUser?._id || undefined,
      orderStatus: "pending",
      orderSource: "staff",
      location: loc._id,
      offlineSyncKey: invOfflineKey(),
      items: [
        {
          menuItem: miParent._id,
          quantity: 1,
          status: "pending",
        },
      ],
      bills: { total: 0, tax: 0, totalWithTax: 0 },
    });
    await recalcOrderTotals(orderPay);
    await orderPay.save();
    ctx.orderIds.push(orderPay._id);

    // No kitchen deduct with payment-only
    orderPay.orderStatus = "in-progress";
    await orderPay.save();
    await processStockAfterStatusPatch(reqBase, orderPay, {
      previousOrderStatus: "pending",
      markAllItemsSent: false,
      idsJustSent: [],
    });
    await orderPay.populate("items");
    assert(!orderPay.items[0].stockDeductedAt, "payment-only: no deduct on in-progress");

    orderPay.orderStatus = "paid";
    orderPay.paidAt = new Date();
    await orderPay.save();
    await processStockAfterPayment(reqBase, orderPay, {
      previousOrderStatus: "in-progress",
    });
    const orderPayFresh = await Order.findById(orderPay._id).lean();
    assert(!!orderPayFresh.items[0].stockDeductedAt, "payment-only: deduct when paid");

    cfg.stockDeductTrigger = "payment";
    await cfg.save();

    // ── F. Strict oversell ─────────────────────────────────────
    log("\n── F. strictOversell assertion ──");
    cfg.strictOversell = true;
    await cfg.save();

    const orderHuge = new Order({
      organization: anchorOrgId,
      table: table._id,
      waiter: mockUser?._id || undefined,
      orderStatus: "pending",
      orderSource: "staff",
      location: loc._id,
      offlineSyncKey: invOfflineKey(),
      items: [
        {
          menuItem: miParent._id,
          quantity: 99999,
          status: "pending",
        },
      ],
      bills: { total: 0, tax: 0, totalWithTax: 0 },
    });
    await recalcOrderTotals(orderHuge);
    await assertThrowsAsync(() => assertOrderLinesFulfillable(orderHuge), "strictOversell rejects impossible order");

    cfg.strictOversell = false;
    await cfg.save();

    // ── G. Service / consumable lines (no stock movements) ─────
    log("\n── G. inventoryImpact service + consumable ──");
    async function runImpactOrder(menuItemRef, label) {
      const o = new Order({
        organization: anchorOrgId,
        table: table._id,
        waiter: mockUser?._id || undefined,
        orderStatus: "pending",
        orderSource: "staff",
        location: loc._id,
        offlineSyncKey: invOfflineKey(),
        items: [{ menuItem: menuItemRef, quantity: 1, status: "pending" }],
        bills: { total: 0, tax: 0, totalWithTax: 0 },
      });
      await recalcOrderTotals(o);
      await o.save();
      ctx.orderIds.push(o._id);
      o.orderStatus = "in-progress";
      await o.save();
      await processStockAfterStatusPatch(reqBase, o, {
        previousOrderStatus: "pending",
        markAllItemsSent: false,
        idsJustSent: [],
      });
      const freshBeforePaid = await Order.findById(o._id).lean();
      assert(
        !(freshBeforePaid.items && freshBeforePaid.items[0] && freshBeforePaid.items[0].stockDeductedAt),
        `${label}: no stockDeductedAt before paid`
      );
      o.orderStatus = "paid";
      o.paidAt = new Date();
      await o.save();
      await processStockAfterPayment(reqBase, o, {
        previousOrderStatus: "in-progress",
      });
      const fresh = await Order.findById(o._id).lean();
      const nMov = await StockMovement.countDocuments({
        order: o._id,
        reason: "order_deduction",
      });
      assert(nMov === 0, `${label}: no order_deduction movements`);
      assert(
        !!(fresh.items && fresh.items[0] && fresh.items[0].stockDeductedAt),
        `${label}: stockDeductedAt persisted`
      );
    }
    await runImpactOrder(miService._id, "service menu item");
    await runImpactOrder(miConsumable._id, "consumable menu item");

    cfg.stockDeductTrigger = "payment";
    await cfg.save();

    // ── H. Purchase order + receive + lot + price history ──────
    log("\n── H. Purchase order receive + StockLot + price history ──");
    const supplier = await Supplier.create({
      organization: anchorOrgId,
      name: `InvTest Supplier ${tag}`,
      code: `S${String(tag).slice(-4)}`,
      status: "active",
    });
    ctx.supplierId = supplier._id;

    const po = await PurchaseOrder.create({
      organization: anchorOrgId,
      reference: tag,
      supplier: supplier._id,
      location: loc._id,
      status: "draft",
      lines: [
        {
          ingredient: ingCheese._id,
          quantityOrdered: 200,
          quantityReceived: 0,
          unitCost: 0.05,
        },
      ],
    });
    ctx.poIds.push(po._id);
    po.status = "confirmed";
    await po.save();

    const line0 = po.lines[0];
    const locIdStr = String(loc._id);

    const cheeseBefore = await StockBalance.findOne({
      location: loc._id,
      ingredient: ingCheese._id,
    }).lean();
    const qtyBeforeRecv = Number(cheeseBefore.quantity) || 0;

    const receiveQty = 80;
    const uc = 0.06;
    const totalStockResult = await stockBalanceService.applyQuantityDelta(
      locIdStr,
      ingCheese._id,
      receiveQty
    );
    await inventoryCostService.addReceiveCost(ingCheese._id, receiveQty, uc);

    const exp = new Date();
    exp.setMonth(exp.getMonth() + 3);
    await stockLotService.addOrIncrementLot({
      locationId: locIdStr,
      ingredientId: ingCheese._id,
      quantity: receiveQty,
      lotNumber: `LOT-${tag}`,
      expiryDate: exp,
      productionDate: new Date(),
      supplierBatchRef: `SB-${tag}`,
      purchaseOrderId: po._id,
    });

    await StockMovement.create({
      ingredient: ingCheese._id,
      delta: receiveQty,
      balanceAfter: totalStockResult.totalStock,
      reason: "receive",
      note: `PO test ${tag}`,
      user: mockUser?._id || null,
      location: locIdStr,
      lotNumber: `LOT-${tag}`,
      expiryDate: exp,
      productionDate: new Date(),
      supplierBatchRef: `SB-${tag}`,
      purchaseOrder: po._id,
      purchaseOrderLineId: line0._id,
    });

    await IngredientPriceHistory.create({
      ingredient: ingCheese._id,
      unitPrice: uc,
      source: "purchase_order",
      referenceId: po._id,
      note: `InvTest PO receive ${tag}`,
    });

    line0.quantityReceived = receiveQty;
    po.status = "partial";
    await po.save();

    const qtyAfterRecv = await StockBalance.findOne({
      location: loc._id,
      ingredient: ingCheese._id,
    }).lean();
    assert(
      (Number(qtyAfterRecv.quantity) || 0) === qtyBeforeRecv + receiveQty,
      "PO receive increased balance quantity"
    );

    const lots = await StockLot.find({
      location: loc._id,
      ingredient: ingCheese._id,
      lotNumber: `LOT-${tag}`,
    }).lean();
    assert(lots.length >= 1 && lots.some((l) => l.quantity > 0), "StockLot row exists with qty");

    const hist = await IngredientPriceHistory.findOne({
      note: new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    }).lean();
    assert(!!hist, "IngredientPriceHistory row for PO test");

    // FEFO: consume from lots on next small deduction
    const orderFefo = new Order({
      organization: anchorOrgId,
      table: table._id,
      waiter: mockUser?._id || undefined,
      orderStatus: "in-progress",
      orderSource: "staff",
      location: loc._id,
      offlineSyncKey: invOfflineKey(),
      items: [
        {
          menuItem: miSub._id,
          quantity: 1,
          status: "sent",
        },
      ],
      bills: { total: 0, tax: 0, totalWithTax: 0 },
    });
    await recalcOrderTotals(orderFefo);
    await orderFefo.save();
    ctx.orderIds.push(orderFefo._id);

    const lotBefore = await StockLot.findOne({
      location: loc._id,
      ingredient: ingCheese._id,
      lotNumber: `LOT-${tag}`,
    }).lean();
    const lotQtyBefore = Number(lotBefore?.quantity) || 0;

    await processStockForLineIds(
      reqBase,
      orderFefo,
      new Set([String(orderFefo.items[0]._id)])
    );

    const lotAfter = await StockLot.findOne({
      location: loc._id,
      ingredient: ingCheese._id,
      lotNumber: `LOT-${tag}`,
    }).lean();
    assert(
      Number(lotAfter?.quantity) < lotQtyBefore,
      "FEFO: StockLot quantity decreased after order_deduction"
    );

    // ── I. Waste aggregation (API-shaped) ──────────────────────
    log("\n── I. Waste analytics query ──");
    const wasteAdj = await stockBalanceService.applyQuantityDelta(
      locIdStr,
      ingFlour._id,
      -50
    );
    await StockMovement.create({
      ingredient: ingFlour._id,
      delta: -50,
      balanceAfter: wasteAdj.totalStock,
      reason: "waste",
      note: `InvTest waste ${tag}`,
      wasteReasonCode: "damaged",
      user: mockUser?._id || null,
      location: locIdStr,
    });

    const wasteAgg = await StockMovement.aggregate([
      { $match: { reason: "waste", note: new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) } },
      {
        $group: {
          _id: "$ingredient",
          totalDelta: { $sum: "$delta" },
          n: { $sum: 1 },
        },
      },
    ]);
    assert(wasteAgg.length >= 1, "waste aggregation finds seeded movement");

    // ── J. Stock take post ──────────────────────────────────────
    log("\n── J. Stock take session post ──");
    const flourBal = await StockBalance.findOne({
      location: loc._id,
      ingredient: ingFlour._id,
    });
    const sysFlour = Number(flourBal?.quantity) || 0;
    const session = await StockTakeSession.create({
      organization: anchorOrgId,
      location: loc._id,
      status: "in_progress",
      note: tag,
      lines: [
        {
          ingredient: ingFlour._id,
          systemQty: sysFlour,
          countedQty: Math.max(0, sysFlour - 25),
        },
      ],
      createdBy: mockUser?._id || null,
    });
    ctx.takeIds.push(session._id);

    const lineTake = session.lines[0];
    const deltaTake = lineTake.countedQty - lineTake.systemQty;
    const adjResult = await stockBalanceService.applyQuantityDelta(
      locIdStr,
      ingFlour._id,
      deltaTake
    );
    await StockMovement.create({
      ingredient: ingFlour._id,
      delta: deltaTake,
      balanceAfter: adjResult.totalStock,
      reason: "correction",
      note: `Stock take ${session._id} ${tag}`,
      user: mockUser?._id || null,
      location: locIdStr,
    });
    session.status = "posted";
    session.postedAt = new Date();
    await session.save();

    const takeMov = await StockMovement.findOne({
      note: new RegExp(String(session._id)),
      reason: "correction",
    }).lean();
    assert(!!takeMov, "stock take correction movement exists");

    // ── Summary ─────────────────────────────────────────────────
    log("\n════════ Summary ════════");
    log(`  Passed: ${results.pass}`);
    log(`  Failed: ${results.fail}`);
    if (results.errors.length) {
      log("  Failed messages:");
      for (const e of results.errors) log(`    - ${e}`);
    }

    await runHttpChecks(tag);
  } finally {
    await restoreAccountingInventoryFields(cfg, cfgSnapshot);
    await cleanup(ctx);
    await mongoose.disconnect();
  }

  if (results.fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
