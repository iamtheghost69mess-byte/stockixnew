const mongoose = require("mongoose");
const MenuItem = require("../models/menuItemModel");
const OrderStockReservation = require("../models/orderStockReservationModel");
const stockBalanceService = require("./stockBalanceService");
const { resolveStockableDemand } = require("./inventoryRecipeUtils");
const { getInventorySettings } = require("./inventorySettingsService");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");

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
 * Apply soft reservations for all lines on a pending order (after save).
 */
async function reserveLinesForOrder(req, orderDoc) {
  const orgId =
    orderDoc.organization ||
    req.tenantOrganizationId ||
    resolveOrganizationIdFromUser(req.user);
  if (!orgId) {
    return;
  }
  const settings = await getInventorySettings(orgId);
  if (!settings.reserveStockOnPending) return;
  const st = normalizeOrderStatus(orderDoc.orderStatus);
  if (st !== "pending") return;

  let locId;
  try {
    locId = await stockBalanceService.resolveLocationIdOrDefaultForOrg(
      stockBalanceService.resolveOrderLocationId(orderDoc),
      orgId
    );
  } catch (e) {
    console.warn(
      "[inventory] reserveLinesForOrder: skipped (no resolvable location for org).",
      String(orgId),
      e?.message || e
    );
    return;
  }

  for (const line of orderDoc.items || []) {
    if (!line.menuItem || line.stockDeductedAt) continue;
    await reserveLine(req, orderDoc, line, locId);
  }
}

async function reserveLine(req, orderDoc, line, locId) {
  if (!line?._id || !line.menuItem) return;
  const mi = await MenuItem.findById(line.menuItem)
    .select("inventoryImpact finishedGoodsIngredient")
    .lean();
  if (!mi || mi.inventoryImpact !== "stockable") return;

  const existing = await OrderStockReservation.exists({
    order: orderDoc._id,
    orderLineId: line._id,
  });
  if (existing) return;

  const mult = Math.max(1, Number(line.quantity) || 1);
  const variantId = line.menuItemVariant || null;
  let demand;
  try {
    demand = await resolveStockableDemand(line.menuItem, mult, variantId);
  } catch {
    return;
  }
  if (!demand.length) return;

  for (const { ingredientId, qty } of demand) {
    if (!mongoose.Types.ObjectId.isValid(ingredientId) || qty <= 0) continue;
    await OrderStockReservation.create({
      order: orderDoc._id,
      orderLineId: line._id,
      ingredient: ingredientId,
      location: locId,
      quantity: qty,
    });
    await stockBalanceService.applyReservedDelta(locId, ingredientId, qty);
  }
}

/**
 * Remove reservation rows for one line and decrement balance reservedQty.
 */
async function releaseReservationsForLine(orderDoc, line) {
  if (!line?._id) return;
  const rows = await OrderStockReservation.find({
    order: orderDoc._id,
    orderLineId: line._id,
  }).lean();

  for (const r of rows) {
    const lid = r.location ? String(r.location) : null;
    if (!lid) continue;
    const q = Number(r.quantity) || 0;
    if (q > 0) {
      await stockBalanceService.applyReservedDelta(lid, r.ingredient, -q);
    }
  }

  if (rows.length) {
    await OrderStockReservation.deleteMany({
      order: orderDoc._id,
      orderLineId: line._id,
    });
  }
}

async function releaseAllReservationsForOrder(orderId) {
  const rows = await OrderStockReservation.find({ order: orderId }).lean();
  for (const r of rows) {
    const lid = r.location ? String(r.location) : null;
    const q = Number(r.quantity) || 0;
    if (lid && q > 0) {
      await stockBalanceService.applyReservedDelta(lid, r.ingredient, -q);
    }
  }
  await OrderStockReservation.deleteMany({ order: orderId });
}

module.exports = {
  normalizeOrderStatus,
  reserveLinesForOrder,
  reserveLine,
  releaseReservationsForLine,
  releaseAllReservationsForOrder,
};
