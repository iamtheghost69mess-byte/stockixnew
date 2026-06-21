const mongoose = require("mongoose");
const StockLot = require("../models/stockLotModel");
const stockBalanceService = require("./stockBalanceService");

/**
 * Add or merge inbound quantity into a lot row (receive path).
 */
async function addOrIncrementLot({
  locationId,
  ingredientId,
  quantity,
  lotNumber = "",
  expiryDate = null,
  productionDate = null,
  supplierBatchRef = "",
  purchaseOrderId = null,
  session = null,
}) {
  const lid = await stockBalanceService.resolveLocationIdOrDefault(locationId);
  const iid = String(ingredientId);
  const qty = Number(quantity);
  if (!qty || qty <= 0) return null;

  const lotKey = {
    location: lid,
    ingredient: iid,
    lotNumber: String(lotNumber || "").trim(),
  };
  const exp =
    expiryDate instanceof Date && !Number.isNaN(expiryDate.getTime())
      ? expiryDate
      : expiryDate
        ? new Date(expiryDate)
        : null;
  if (exp && Number.isNaN(exp.getTime())) {
    throw new Error("Invalid expiryDate");
  }

  const findLot = StockLot.findOne(lotKey);
  if (session) findLot.session(session);
  let row = await findLot;
  if (!row) {
    const created = await StockLot.create(
      [
        {
          ...lotKey,
          quantity: qty,
          expiryDate: exp,
          productionDate:
            productionDate instanceof Date
              ? productionDate
              : productionDate
                ? new Date(productionDate)
                : null,
          supplierBatchRef: String(supplierBatchRef || "").slice(0, 128),
          purchaseOrder: purchaseOrderId || null,
        },
      ],
      session ? { session } : {}
    );
    row = created[0];
  } else {
    row.quantity = (Number(row.quantity) || 0) + qty;
    if (exp && !row.expiryDate) row.expiryDate = exp;
    if (productionDate && !row.productionDate) {
      row.productionDate =
        productionDate instanceof Date
          ? productionDate
          : new Date(productionDate);
    }
    if (supplierBatchRef && !row.supplierBatchRef) {
      row.supplierBatchRef = String(supplierBatchRef).slice(0, 128);
    }
    await row.save(session ? { session } : {});
  }
  return row;
}

function buildAutoLotNumber({ ingredientId, receivedAt }) {
  const at = receivedAt instanceof Date ? receivedAt : new Date(receivedAt || Date.now());
  const stamp = [
    at.getUTCFullYear(),
    String(at.getUTCMonth() + 1).padStart(2, "0"),
    String(at.getUTCDate()).padStart(2, "0"),
    String(at.getUTCHours()).padStart(2, "0"),
    String(at.getUTCMinutes()).padStart(2, "0"),
    String(at.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  return `LOT-${String(ingredientId)}-${stamp}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
}

/**
 * Create one inbound lot record for a receipt/opening/manual inbound.
 */
async function createInboundLot({
  locationId,
  ingredientId,
  quantity,
  lotNumber,
  receivedAt = new Date(),
  unitCost = 0,
  expiryDate = null,
  productionDate = null,
  supplierBatchRef = "",
  purchaseOrderId = null,
  source = "purchase",
  zoneId = null,
  binId = null,
  isUnverifiedFifoHistory = false,
  session = null,
}) {
  const lid = await stockBalanceService.resolveLocationIdOrDefault(locationId);
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Inbound lot quantity must be a positive number");
  }
  const cost = Number(unitCost);
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error("Inbound lot unitCost must be >= 0");
  }
  const recvAt = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  if (Number.isNaN(recvAt.getTime())) {
    throw new Error("Invalid receivedAt");
  }
  const lotNo = String(lotNumber || "").trim() || buildAutoLotNumber({ ingredientId, receivedAt: recvAt });
  const exp = expiryDate ? new Date(expiryDate) : null;
  if (exp && Number.isNaN(exp.getTime())) {
    throw new Error("Invalid expiryDate");
  }
  const prod = productionDate ? new Date(productionDate) : null;
  if (prod && Number.isNaN(prod.getTime())) {
    throw new Error("Invalid productionDate");
  }

  const payload = {
    location: lid,
    ingredient: ingredientId,
    lotNumber: lotNo,
    receivedAt: recvAt,
    quantity: qty,
    originalQuantity: qty,
    unitCost: cost,
    expiryDate: exp,
    productionDate: prod,
    supplierBatchRef: String(supplierBatchRef || "").slice(0, 128),
    purchaseOrder: purchaseOrderId || null,
    source,
    zone: zoneId || null,
    bin: binId || null,
    isUnverifiedFifoHistory: Boolean(isUnverifiedFifoHistory),
  };

  const created = await StockLot.create([payload], session ? { session } : {});
  return created[0];
}

/**
 * Consume quantity from lots (FEFO: soonest expiry first; null expiry last).
 * Does not change StockBalance — caller applies quantity delta separately.
 * @returns {Array<{ lotNumber: string, expiryDate: Date|null, qty: number }>}
 */
/**
 * @param {import("mongoose").ClientSession|null} [session]
 */
async function consumeLotsFefo(locationId, ingredientId, quantity, session = null) {
  const lid = await stockBalanceService.resolveLocationIdOrDefault(locationId);
  const iid = String(ingredientId);
  let need = Number(quantity);
  if (!need || need <= 0) return [];

  const lotQ = StockLot.find({
    location: lid,
    ingredient: iid,
    quantity: { $gt: 0 },
  }).sort({ expiryDate: 1, createdAt: 1 });
  if (session) lotQ.session(session);
  const lots = await lotQ;

  const out = [];
  for (const lot of lots) {
    if (need <= 0) break;
    const have = Number(lot.quantity) || 0;
    if (have <= 0) continue;
    const take = Math.min(have, need);
    lot.quantity = have - take;
    await lot.save(session ? { session } : {});
    need -= take;
    out.push({
      lotNumber: lot.lotNumber || "",
      expiryDate: lot.expiryDate || null,
      qty: take,
    });
  }
  return out;
}

/**
 * Consume quantity from lots in strict lot order depending on cost method.
 * Returns consumed slices with unitCost for movement valuation.
 */
async function consumeLotsByMethod(
  locationId,
  ingredientId,
  quantity,
  costMethod = "fifo",
  session = null
) {
  const lid = await stockBalanceService.resolveLocationIdOrDefault(locationId);
  let need = Number(quantity);
  if (!Number.isFinite(need) || need <= 0) return [];

  const method = String(costMethod || "fifo").toLowerCase();
  const lotQ = StockLot.find({
    location: lid,
    ingredient: String(ingredientId),
    quantity: { $gt: 0 },
  });
  if (session) lotQ.session(session);
  let lots = await lotQ;
  if (method === "fefo") {
    lots = lots.sort((a, b) => {
      const ae = a.expiryDate ? new Date(a.expiryDate).getTime() : Number.POSITIVE_INFINITY;
      const be = b.expiryDate ? new Date(b.expiryDate).getTime() : Number.POSITIVE_INFINITY;
      if (ae !== be) return ae - be;
      const ar = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
      const br = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
      return ar - br;
    });
  } else {
    lots = lots.sort((a, b) => {
      const ar = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
      const br = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
      return ar - br;
    });
  }

  const out = [];
  for (const lot of lots) {
    if (need <= 0) break;
    const available = Number(lot.quantity) || 0;
    if (available <= 0) continue;
    const take = Math.min(available, need);
    lot.quantity = available - take;
    await lot.save(session ? { session } : {});
    need -= take;
    out.push({
      lotId: String(lot._id),
      lotNumber: lot.lotNumber || "",
      expiryDate: lot.expiryDate || null,
      receivedAt: lot.receivedAt || lot.createdAt || null,
      qty: take,
      unitCost: Number(lot.unitCost) || 0,
      source: lot.source || "purchase",
      isUnverifiedFifoHistory: Boolean(lot.isUnverifiedFifoHistory),
    });
  }
  return out;
}

/**
 * True if any lot at location for ingredient is expired (end of local day).
 */
async function hasExpiredLotStock(locationId, ingredientId, asOf = new Date()) {
  const lid = await stockBalanceService.resolveLocationIdOrDefault(locationId);
  const iid = String(ingredientId);
  const rows = await StockLot.find({
    location: lid,
    ingredient: iid,
    quantity: { $gt: 0 },
    expiryDate: { $ne: null },
  }).lean();
  const end = new Date(asOf);
  end.setHours(23, 59, 59, 999);
  return rows.some((r) => {
    const d = new Date(r.expiryDate);
    return !Number.isNaN(d.getTime()) && d < end;
  });
}

module.exports = {
  addOrIncrementLot,
  createInboundLot,
  consumeLotsFefo,
  consumeLotsByMethod,
  hasExpiredLotStock,
};
