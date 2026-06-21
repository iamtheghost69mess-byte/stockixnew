const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Recipe = require("../models/recipeModel");
const Ingredient = require("../models/ingredientModel");
const MenuItem = require("../models/menuItemModel");
const StockBalance = require("../models/stockBalanceModel");
const StockMovement = require("../models/stockMovementModel");
const inventoryCostService = require("./inventoryCostService");
const stockBalanceService = require("./stockBalanceService");
const { resolveStockableDemand } = require("./inventoryRecipeUtils");
const orderReservationService = require("./orderReservationService");
const {
  getInventorySettings,
} = require("./inventorySettingsService");
const stockLotService = require("./stockLotService");
const { recordInventoryAudit } = require("./inventoryAuditService");
const { emitPos } = require("../utils/socketEmit");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");

const RESTORE_REASONS = new Set(["order_line_void", "order_cancel"]);

/**
 * StockMovement.reason values treated as "consumption / outbound activity" for slow-moving analysis.
 * Must be a subset of {@link StockMovement} schema enum (see stockMovementModel.REASONS).
 */
const SLOW_MOVING_CONSUMPTION_REASONS = [
  "order_deduction",
  "sale",
  "order_line_void",
  "order_cancel",
  "waste",
  "vendor_return",
  "transfer_out",
  "manual_adjust",
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function inventorySettingsOrgId(req, orderDoc) {
  if (orderDoc && orderDoc.organization) return orderDoc.organization;
  if (req && req.tenantOrganizationId) return req.tenantOrganizationId;
  if (req && req.user) return resolveOrganizationIdFromUser(req.user);
  return null;
}

function emitInventoryUpdated(req, ingredientIds) {
  const ids = [...new Set((ingredientIds || []).map(String))];
  emitPos(req, "inventory:updated", {
    ingredientIds: ids,
    at: Date.now(),
  });
}

function movementTypeFromReason(reason) {
  if (reason === "order_deduction" || reason === "sale") return "sale";
  if (reason === "waste" || reason === "wastage") return "wastage";
  if (reason === "receive") return "receive";
  if (reason === "transfer_in" || reason === "transfer_out") return "transfer";
  if (reason === "order_line_void" || reason === "order_cancel" || reason === "customer_return") return "refund";
  return "adjustment";
}

async function restoreStockForOrderLine(req, order, line, reason) {
  if (!RESTORE_REASONS.has(reason)) {
    throw new Error(`restoreStockForOrderLine: invalid reason "${reason}"`);
  }
  if (!line || !line._id || !line.menuItem || !line.stockDeductedAt) {
    return { replenishedIds: [] };
  }

  const deductions = await StockMovement.find({
    order: order._id,
    orderLineId: line._id,
    reason: { $in: ["order_deduction", "sale"] },
  }).lean();

  if (!deductions.length) {
    line.stockDeductedAt = null;
    return { replenishedIds: [] };
  }

  const replenishedIds = [];

  for (const d of deductions) {
    const reversed = await StockMovement.exists({ reversesMovement: d._id });
    if (reversed) continue;

    const ing = await Ingredient.findById(d.ingredient);
    if (!ing) continue;

    const credit = -Number(d.delta);
    if (credit <= 0) continue;

    const costAmt = Number(d.costAmount);
    let restorationResult = { totalCost: 0 };
    if (costAmt > 0) {
      restorationResult = await inventoryCostService.restoreIngredientCost(
        ing._id,
        credit,
        costAmt
      );
    }

    let totalStock;
    let locId = d.location ? String(d.location) : null;
    if (locId) {
      const r = await stockBalanceService.applyQuantityDelta(
        locId,
        ing._id,
        credit
      );
      totalStock = r.totalStock;
    } else {
      const prev = Number(ing.currentStock) || 0;
      totalStock = prev + credit;
      ing.currentStock = totalStock;
      await ing.save();
    }

    await StockMovement.create({
      ingredient: ing._id,
      delta: credit,
      balanceAfter: totalStock,
      reason,
      movementType: movementTypeFromReason(reason),
      order: order._id,
      orderLineId: line._id,
      user: req.user?._id || null,
      reversesMovement: d._id,
      note: `Reversal of deduction ${d._id}`,
      location: locId,
      costAmount: restorationResult.unitCost,
      extendedValue: restorationResult.totalCost,
      lotNumber: d.lotNumber || "",
      expiryDate: d.expiryDate || null,
      productionDate: d.productionDate || null,
      supplierBatchRef: d.supplierBatchRef || "",
    });

    if (
      locId &&
      d.lotNumber &&
      !String(d.lotNumber).includes(",") &&
      credit > 0
    ) {
      try {
        await stockLotService.addOrIncrementLot({
          locationId: locId,
          ingredientId: ing._id,
          quantity: credit,
          lotNumber: String(d.lotNumber).trim(),
          expiryDate: d.expiryDate || null,
          productionDate: d.productionDate || null,
          supplierBatchRef: d.supplierBatchRef || "",
          purchaseOrderId: null,
        });
      } catch {
        /* Multi-lot or unknown lot keys cannot be restored precisely. */
      }
    }

    replenishedIds.push(String(ing._id));
  }

  line.stockDeductedAt = null;
  return { replenishedIds };
}

async function restoreStockForAllDeductedLines(req, orderDoc, reason) {
  if (!orderDoc?.items?.length) return;

  let shouldSave = false;
  const allRepl = [];

  for (const line of orderDoc.items) {
    if (!line.stockDeductedAt || !line.menuItem) continue;
    shouldSave = true;
    const r = await restoreStockForOrderLine(req, orderDoc, line, reason);
    allRepl.push(...r.replenishedIds);
  }

  if (shouldSave) {
    orderDoc.markModified("items");
    await orderDoc.save();
  }

  if (allRepl.length) {
    emitInventoryUpdated(req, allRepl);
  }
}

function normalizeOrderStatus(s) {
  if (s == null || s === "") return "pending";
  const key = String(s).toLowerCase().trim().replace(/\s+/g, " ");
  const map = {
    "in progress": "in-progress",
    pending: "pending",
    ready: "ready",
    served: "served",
    paid: "paid",
    cancelled: "cancelled",
  };
  if (map[key]) return map[key];
  return String(s).toLowerCase().replace(/\s+/g, "-");
}

/**
 * Throws 400 if strictOversell and any stockable line cannot be fulfilled.
 */
async function assertOrderLinesFulfillable(orderDoc) {
  const settings = await getInventorySettings(orderDoc?.organization);
  if (!settings.strictOversell) return;

  let resolvedLoc = null;
  let useLocationBalances = true;
  const orgId = inventorySettingsOrgId(null, orderDoc);
  try {
    resolvedLoc = await stockBalanceService.resolveLocationIdOrDefaultForOrg(
      stockBalanceService.resolveOrderLocationId(orderDoc),
      orgId
    );
  } catch (e) {
    if (orgId) {
      throw createHttpError(
        400,
        e?.message ||
          "No locations exist for this organization. Create a location first."
      );
    }
    useLocationBalances = false;
  }

  for (const line of orderDoc.items || []) {
    if (!line.menuItem) continue;
    const mi = await MenuItem.findById(line.menuItem)
      .select("inventoryImpact finishedGoodsIngredient name")
      .lean();
    if (!mi || mi.inventoryImpact !== "stockable") continue;

    const mult = Math.max(1, Number(line.quantity) || 1);
    let demand;
    try {
      demand = await resolveStockableDemand(
        line.menuItem,
        mult,
        line.menuItemVariant
      );
    } catch (e) {
      if (e.code === "CIRCULAR_RECIPE" || e.code === "BOM_DEPTH") {
        throw createHttpError(400, e.message);
      }
      throw e;
    }

    for (const { ingredientId, qty } of demand) {
      if (qty <= 0) continue;
      const expired = useLocationBalances &&
        resolvedLoc &&
        (await stockLotService.hasExpiredLotStock(resolvedLoc, ingredientId));
      if (expired) {
        throw createHttpError(
          400,
          `Expired lot stock for ingredient; cannot sell ${mi.name || "item"}.`
        );
      }

      if (useLocationBalances && resolvedLoc) {
        const balQ = {
          location: resolvedLoc,
          ingredient: ingredientId,
          bin: null,
        };
        if (orgId) {
          balQ.organization = orgId;
        }
        const row = await StockBalance.findOne(balQ).lean();
        const q = Number(row?.quantity) || 0;
        const r = Number(row?.reservedQty) || 0;
        const avail = q - r;
        if (avail < qty) {
          const ing = await Ingredient.findById(ingredientId).select("name").lean();
          throw createHttpError(
            400,
            `Insufficient stock for "${mi.name}": need ${qty} of ${ing?.name || "ingredient"}, available ${avail}.`
          );
        }
      } else {
        const ing = await Ingredient.findById(ingredientId).lean();
        const q = Number(ing?.currentStock) || 0;
        if (q < qty) {
          throw createHttpError(
            400,
            `Insufficient stock for "${mi.name}": need ${qty}, on hand ${q}.`
          );
        }
      }
    }
  }
}

async function deductForOrderLine(req, order, line, opts = {}) {
  const { mongooseSession: outerSession = null } = opts;
  if (!line.menuItem || line.stockDeductedAt) {
    return { lowStock: [] };
  }

  const menuItemDoc = await MenuItem.findById(line.menuItem)
    .select("inventoryImpact finishedGoodsIngredient")
    .lean();
  const impact = menuItemDoc?.inventoryImpact || "stockable";

  if (impact === "service") {
    line.stockDeductedAt = new Date();
    return { lowStock: [] };
  }

  if (impact === "consumable") {
    line.stockDeductedAt = new Date();
    return { lowStock: [] };
  }

  const recipe = await Recipe.findOne({ menuItem: line.menuItem }).lean();
  if (
    !menuItemDoc?.finishedGoodsIngredient &&
    (!recipe || !recipe.ingredients.length)
  ) {
    line.stockDeductedAt = new Date();
    return { lowStock: [] };
  }

  await orderReservationService.releaseReservationsForLine(order, line);

  const settings = await getInventorySettings(
    inventorySettingsOrgId(req, order)
  );
  const mult = Math.max(1, Number(line.quantity) || 1);
  let demand;
  try {
    demand = await resolveStockableDemand(
      line.menuItem,
      mult,
      line.menuItemVariant
    );
  } catch (e) {
    if (e.code === "CIRCULAR_RECIPE" || e.code === "BOM_DEPTH") {
      throw createHttpError(400, e.message);
    }
    throw e;
  }

  if (!demand.length) {
    line.stockDeductedAt = new Date();
    return { lowStock: [] };
  }

  if (settings.strictOversell) {
    const tempOrder = { ...order.toObject?.() || order, items: [line] };
    await assertOrderLinesFulfillable({
      ...tempOrder,
      items: [line],
      location: order.location,
      _id: order._id,
    });
  }

  const orderLoc = stockBalanceService.resolveOrderLocationId(order);
  let resolvedLoc;
  let useLocationBalances = true;
  const orgId = inventorySettingsOrgId(req, order);
  try {
    resolvedLoc = await stockBalanceService.resolveLocationIdOrDefaultForOrg(
      orderLoc,
      orgId
    );
  } catch (e) {
    if (orgId) {
      throw createHttpError(
        400,
        e?.message ||
          "No locations exist for this organization. Create a location first."
      );
    }
    useLocationBalances = false;
    resolvedLoc = null;
  }

  const lowStock = [];

  const deductOneIngredient = async (dbSession) => {
    for (const { ingredientId, qty: useQty } of demand) {
      if (useQty <= 0) continue;

      const ingQuery = Ingredient.findById(ingredientId);
      if (dbSession) ingQuery.session(dbSession);
      const ing = await ingQuery;
      if (!ing) continue;
      if (String(ing.status || "active") === "archived") continue;

      let lotMeta = {
        lotNumber: "",
        expiryDate: null,
        lotSlices: [],
        hasUnverifiedFifoHistory: false,
      };
      if (useLocationBalances && resolvedLoc) {
        const lotCostMethod = await inventoryCostService.getCostMethod();
        const lotSlices = await stockLotService.consumeLotsByMethod(
          resolvedLoc,
          ing._id,
          useQty,
          lotCostMethod,
          dbSession
        );
        if (lotSlices.length) {
          lotMeta = {
            lotNumber: lotSlices.map((s) => s.lotNumber).filter(Boolean).join(",") || "",
            expiryDate: lotSlices.find((s) => s.expiryDate)?.expiryDate || null,
            lotSlices,
            hasUnverifiedFifoHistory: lotSlices.some((s) => s.isUnverifiedFifoHistory),
          };
        }
      }

      let totalStock;
      if (useLocationBalances && resolvedLoc) {
        const r = await stockBalanceService.applyQuantityDelta(
          resolvedLoc,
          ing._id,
          -useQty,
          dbSession
        );
        totalStock = r.totalStock;
      } else {
        const prev = Number(ing.currentStock) || 0;
        totalStock = Math.max(0, prev - useQty);
        ing.currentStock = totalStock;
        await ing.save(dbSession ? { session: dbSession } : {});
      }

      const { totalCost } = await inventoryCostService.consumeIngredientCost(
        ing._id,
        useQty,
        dbSession,
        lotMeta.lotSlices
      );

      const movementOrgId = inventorySettingsOrgId(req, order);
      await StockMovement.create(
        [
          {
            organization: movementOrgId || null,
            ingredient: ing._id,
            delta: -useQty,
            balanceAfter: totalStock,
            reason: "sale",
            movementType: "sale",
            order: order._id,
            orderLineId: line._id,
            user: req.user?._id || null,
            note: `Menu line ×${mult}`,
            costAmount:
              totalCost > 0 ? totalCost / useQty : Number(ing.unitCost) || 0,
            extendedValue: totalCost,
            location: useLocationBalances && resolvedLoc ? resolvedLoc : null,
            lotNumber: lotMeta.lotNumber,
            expiryDate: lotMeta.expiryDate,
            isUnverifiedFifoHistory: lotMeta.hasUnverifiedFifoHistory,
          },
        ],
        dbSession ? { session: dbSession } : {}
      );

      if (totalStock <= Number(ing.reorderThreshold || 0)) {
        lowStock.push(String(ing._id));
      }
    }
  };

  if (outerSession) {
    await deductOneIngredient(outerSession);
  } else if (useLocationBalances && resolvedLoc) {
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        await deductOneIngredient(dbSession);
      });
    } finally {
      await dbSession.endSession();
    }
  } else {
    const legacySession = await mongoose.startSession();
    try {
      await legacySession.withTransaction(async () => {
        await deductOneIngredient(legacySession);
      });
    } finally {
      legacySession.endSession();
    }
  }

  if (orgId) {
    try {
      await recordInventoryAudit({
        organizationId: orgId,
        action: "inventory.order_deduction",
        sourceType: "order",
        sourceId: order._id,
        actorId: req.user?._id,
        metadata: {
          orderLineId: line._id ? String(line._id) : null,
          menuItemId: line.menuItem ? String(line.menuItem) : null,
          locationId: resolvedLoc ? String(resolvedLoc) : null,
          usedLocationBalances: Boolean(useLocationBalances && resolvedLoc),
        },
      });
    } catch {
      /* non-fatal */
    }
  }

  line.stockDeductedAt = new Date();
  return { lowStock };
}

async function processStockForLineIds(req, orderDoc, lineIds, opts = {}) {
  const { mongooseSession = null } = opts;
  if (!lineIds || !lineIds.size) return;
  let touched = false;
  const allLow = [];

  for (const lid of lineIds) {
    const line = orderDoc.items.id(lid);
    if (!line || !line.menuItem || line.stockDeductedAt) continue;
    const { lowStock } = await deductForOrderLine(req, orderDoc, line, {
      mongooseSession,
    });
    allLow.push(...lowStock);
    touched = true;
  }

  if (touched) {
    orderDoc.markModified("items");
    await orderDoc.save(mongooseSession ? { session: mongooseSession } : {});
  }

  const uniqueLow = [...new Set(allLow)];
  if (uniqueLow.length) {
    emitPos(req, "inventory:low-stock", { ingredientIds: uniqueLow });
  }
}

async function processStockAfterStatusPatch(
  req,
  orderDoc,
  { previousOrderStatus, markAllItemsSent, idsJustSent }
) {
  // Deduction-on-send is disabled. Stock always deducts on paid transition.
  void req;
  void orderDoc;
  void previousOrderStatus;
  void markAllItemsSent;
  void idsJustSent;
}

async function processStockAfterItemsPatch(req, orderDoc) {
  // Deduction-on-send is disabled. Stock always deducts on paid transition.
  void req;
  void orderDoc;
}

/**
 * Deduct any lines not yet deducted when the order becomes paid.
 * @param {object} opts
 * @param {string} opts.previousOrderStatus
 * @param {import("mongoose").ClientSession | null} [opts.mongooseSession]
 */
async function processStockAfterPayment(req, orderDoc, opts = {}) {
  const { previousOrderStatus, mongooseSession = null } = opts;
  const prev = normalizeOrderStatus(previousOrderStatus);
  const cur = normalizeOrderStatus(orderDoc.orderStatus);
  if (cur !== "paid" || prev === "paid") return;

  const ids = new Set(
    orderDoc.items
      .filter((l) => l.menuItem && !l.stockDeductedAt)
      .map((l) => String(l._id))
  );
  await processStockForLineIds(req, orderDoc, ids, { mongooseSession });
}

async function listLowStockIngredients(organizationId = null, locationId = null) {
  const q = {
    status: { $ne: "archived" },
    $expr: {
      $lte: ["$currentStock", { $ifNull: ["$reorderThreshold", 0] }],
    },
  };
  if (organizationId) q.organization = organizationId;
  if (locationId) q.location = locationId;
  return Ingredient.find(q).sort({ name: 1 }).lean();
}

async function buildInventoryReport(organizationId = null, locationId = null) {
  const ingQ = organizationId ? { organization: organizationId } : {};
  if (locationId) ingQ.location = locationId;
  const ingredients = await Ingredient.find(ingQ).sort({ name: 1 }).lean();
  const stockById = new Map(
    ingredients.map((i) => [String(i._id), Number(i.currentStock) || 0])
  );

  const belowThreshold = ingredients.filter(
    (i) => Number(i.currentStock) <= Number(i.reorderThreshold || 0)
  );

  const recQ = organizationId ? { organization: organizationId } : {};
  if (locationId) recQ.location = locationId;
  const recipes = await Recipe.find(recQ).populate("menuItem", "name").lean();

  const portionsByDish = [];
  for (const r of recipes) {
    const mi = r.menuItem;
    if (!mi || typeof mi !== "object") continue;
    let portions = Infinity;
    for (const row of r.ingredients || []) {
      if (row.optional || row.subMenuItem) continue;
      const iid = String(row.ingredient);
      const need = Number(row.quantity) || 0;
      if (need <= 0) continue;
      const stock = stockById.has(iid) ? stockById.get(iid) : 0;
      const p = Math.floor(stock / need);
      portions = Math.min(portions, p);
    }
    portionsByDish.push({
      menuItemId: mi._id,
      menuItemName: mi.name,
      estimatedPortions:
        portions === Infinity ? null : Math.max(0, portions),
    });
  }

  return {
    ingredients,
    belowThreshold,
    portionsByDish,
  };
}

async function buildValuationReport(organizationId, { locationId, costMethod } = {}) {
  const method = costMethod || (await inventoryCostService.getCostMethod());
  const match = { organization: organizationId };
  if (locationId) match.location = new mongoose.Types.ObjectId(String(locationId));

  const balances = await StockBalance.find(match).populate("ingredient").lean();
  let grandTotal = 0;
  const rows = [];

  for (const b of balances) {
    const ing = b.ingredient;
    if (!ing) continue;
    const qty = Number(b.quantity) || 0;
    if (qty <= 0) continue;

    let unitCost = 0;
    if (method === "weighted_average") {
      unitCost = Number(ing.averageUnitCost) || Number(ing.unitCost) || 0;
    } else if (method === "standard") {
      unitCost = Number(ing.unitCost) || 0;
    } else {
      // FIFO / LIFO: blended unit cost from remaining layers (order irrelevant for valuation total)
      const layers = await mongoose.model("InventoryCostLayer").find({
        ingredient: ing._id,
        quantityRemaining: { $gt: 0 }
      }).lean();
      const totalRem = layers.reduce((s, l) => s + l.quantityRemaining, 0);
      const totalVal = layers.reduce((s, l) => s + (l.quantityRemaining * l.unitCost), 0);
      unitCost = totalRem > 0 ? totalVal / totalRem : Number(ing.unitCost) || 0;
    }

    const value = round2(qty * unitCost);
    grandTotal += value;
    rows.push({
      ingredient: { _id: ing._id, name: ing.name, sku: ing.sku, unit: ing.unit },
      location: b.location,
      quantity: qty,
      unitCost,
      value
    });
  }

  return { grandTotal: round2(grandTotal), rows, costMethod: method };
}

async function buildSlowMovingReport(organizationId, { days = 30 } = {}) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const ingredients = await Ingredient.find({ organization: organizationId }).lean();
  const movingIds = await StockMovement.distinct("ingredient", {
    organization: organizationId,
    reason: { $in: SLOW_MOVING_CONSUMPTION_REASONS },
    createdAt: { $gte: cutoff }
  });

  const movingSet = new Set(movingIds.map(String));
  const slow = [];

  for (const ing of ingredients) {
    if (movingSet.has(String(ing._id))) continue;

    const lastMove = await StockMovement.findOne({
      organization: organizationId,
      ingredient: ing._id,
      reason: { $in: SLOW_MOVING_CONSUMPTION_REASONS }
    }).sort({ createdAt: -1 }).lean();

    const balances = await StockBalance.find({ ingredient: ing._id }).lean();
    const qty = balances.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
    const unitCost = Number(ing.averageUnitCost) || Number(ing.unitCost) || 0;
    const value = round2(qty * unitCost);

    const daysSince = lastMove ? Math.floor((new Date() - lastMove.createdAt) / (1000 * 60 * 60 * 24)) : Infinity;

    slow.push({
      ingredient: { _id: ing._id, name: ing.name, sku: ing.sku, unit: ing.unit },
      currentStock: qty,
      stockValue: value,
      lastMovementDate: lastMove?.createdAt || null,
      daysSinceLastConsumption: daysSince
    });
  }

  return slow.sort((a, b) => b.stockValue - a.stockValue);
}

module.exports = {
  SLOW_MOVING_CONSUMPTION_REASONS,
  emitInventoryUpdated,
  restoreStockForOrderLine,
  restoreStockForAllDeductedLines,
  assertOrderLinesFulfillable,
  deductForOrderLine,
  processStockForLineIds,
  processStockAfterStatusPatch,
  processStockAfterItemsPatch,
  processStockAfterPayment,
  listLowStockIngredients,
  buildInventoryReport,
  buildValuationReport,
  buildSlowMovingReport,
};
