const mongoose = require("mongoose");
const GoodsReceiptNote = require("../models/goodsReceiptNoteModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const StockMovement = require("../models/stockMovementModel");
const IngredientPriceHistory = require("../models/ingredientPriceHistoryModel");
const stockBalanceService = require("./stockBalanceService");
const inventoryCostService = require("./inventoryCostService");
const stockLotService = require("./stockLotService");
const accountingService = require("./accountingService");
const { recordInventoryAudit } = require("./inventoryAuditService");
const { emitPos } = require("../utils/socketEmit");

async function createGRNFromPO(purchaseOrderId, organizationId, userId) {
  const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, organization: organizationId });
  if (!po) throw new Error("Purchase Order not found");
  if (!["confirmed", "partial"].includes(po.status)) {
    throw new Error("PO must be confirmed or partial to create a GRN");
  }

  const grn = new GoodsReceiptNote({
    organization: organizationId,
    purchaseOrder: po._id,
    supplier: po.supplier,
    location: po.location,
    receivedBy: userId,
    status: "draft",
    lines: po.lines.map((line) => {
      const ordered = Number(line.quantityOrdered) || 0;
      const alreadyRecv = Number(line.quantityReceived) || 0;
      const outstanding = Math.max(0, ordered - alreadyRecv);
      return {
        ingredient: line.ingredient,
        purchaseOrderLineId: String(line._id),
        quantityExpected: outstanding,
        quantityReceived: 0,
        unitCost: Number(line.unitCost) || 0,
      };
    }),
  });

  return grn.save();
}

async function confirmGRN(grnId, organizationId, userId, req = null) {
  const session = await mongoose.startSession();
  let grnOut = null;
  try {
    await session.withTransaction(async () => {
      const grn = await GoodsReceiptNote.findOne({ _id: grnId, organization: organizationId })
        .session(session)
        .populate({ path: "lines.ingredient", options: { session } });
      if (!grn) throw new Error("GRN not found");
      if (grn.status !== "draft") throw new Error("GRN is already processed");

      const po = await PurchaseOrder.findById(grn.purchaseOrder).session(session);
      if (!po) throw new Error("Linked Purchase Order not found");

      const locId = String(grn.location);

      for (const line of grn.lines) {
        const qty =
          Number(line.quantityReceived) ||
          Number(line.receivedQty) ||
          0;
        if (qty <= 0) continue;

        const ing = line.ingredient;
        if (!ing || !ing._id) continue;
        const poLine = po.lines.id(line.purchaseOrderLineId);
        if (!poLine) continue;

        const totalStockResult = await stockBalanceService.applyQuantityDelta(
          locId,
          ing._id,
          qty,
          session
        );
        await stockBalanceService.applyIncomingDelta(locId, ing._id, -qty, session);
        const totalStock = totalStockResult.totalStock;

        const uc =
          Number(line.unitCost) ||
          Number(poLine.unitCost) ||
          Number(ing.unitCost) ||
          0;
        const costingResult = await inventoryCostService.addReceiveCost(
          ing._id,
          qty,
          uc,
          session
        );

        const lotNum = line.lotNumber != null ? String(line.lotNumber).trim() : "";
        const batchRef =
          line.supplierBatchRef != null ? String(line.supplierBatchRef).trim() : "";
        let lotExpiryDate = line.expiryDate || null;
        if (!lotExpiryDate && Number(ing.shelfLifeDays) > 0) {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() + Number(ing.shelfLifeDays));
          lotExpiryDate = d;
        }

        await stockLotService.createInboundLot({
          locationId: locId,
          ingredientId: ing._id,
          quantity: qty,
          lotNumber: lotNum,
          receivedAt: new Date(),
          unitCost: uc,
          expiryDate: lotExpiryDate,
          productionDate: line.productionDate || null,
          supplierBatchRef: batchRef,
          purchaseOrderId: po._id,
          source: "purchase",
          zoneId: line.zone || null,
          binId: line.bin || null,
          isUnverifiedFifoHistory: false,
          session,
        });

        const unitCostForMove =
          costingResult && typeof costingResult.unitCost === "number"
            ? costingResult.unitCost
            : uc;
        const totalCostForMove =
          costingResult && typeof costingResult.totalCost === "number"
            ? costingResult.totalCost
            : inventoryCostService.round2(qty * uc);

        await StockMovement.create(
          [
            {
              organization: organizationId,
              ingredient: ing._id,
              delta: qty,
              balanceAfter: totalStock,
              reason: "receive",
              note: `GRN ${grn._id} (PO ${po._id})`,
              user: userId,
              location: locId,
              costAmount: unitCostForMove,
              extendedValue: totalCostForMove,
              lotNumber: line.lotNumber,
              expiryDate: line.expiryDate,
              productionDate: line.productionDate,
              supplierBatchRef: line.supplierBatchRef,
              purchaseOrder: po._id,
              purchaseOrderLineId: poLine._id,
            },
          ],
          { session }
        );

        await IngredientPriceHistory.create(
          [
            {
              organization: organizationId,
              ingredient: ing._id,
              unitPrice: uc,
              source: "purchase_order",
              referenceId: po._id,
              note: `GRN ${grn._id}`,
            },
          ],
          { session }
        );

        poLine.quantityReceived = (Number(poLine.quantityReceived) || 0) + qty;
      }

      await recordInventoryAudit({
        organizationId,
        action: "inventory.grn_confirmed",
        sourceType: "goods_receipt_note",
        sourceId: grn._id,
        actorId: userId,
        metadata: {
          grnId: String(grn._id),
          purchaseOrderId: String(po._id),
        },
        session,
      });

      grn.status = "confirmed";
      grn.receivedAt = new Date();
      await grn.save({ session });
      await po.save({ session });
      grnOut = grn;
    });
  } finally {
    await session.endSession();
  }

  if (!grnOut) {
    throw new Error("GRN confirm did not complete");
  }

  try {
    const receivesForAccrual = grnOut.lines
      .filter((l) => (Number(l.quantityReceived) || Number(l.receivedQty) || 0) > 0)
      .map((l) => ({
        lineId: l.purchaseOrderLineId,
        quantity: Number(l.quantityReceived) || Number(l.receivedQty) || 0,
        unitCost: l.unitCost,
      }));
    await accountingService.postGrniAccrual(grnOut.purchaseOrder, receivesForAccrual, userId);
  } catch (err) {
    console.error("[grnService] GRNI accrual failed:", err.message);
  }

  if (req) {
    emitPos(req, "inventory:updated", { ingredientIds: [], at: Date.now() });
  }

  return grnOut;
}

module.exports = {
  createGRNFromPO,
  confirmGRN,
};
