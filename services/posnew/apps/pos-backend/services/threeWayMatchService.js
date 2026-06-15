const mongoose = require("mongoose");
const PurchaseOrder = require("../models/purchaseOrderModel");
const GoodsReceiptNote = require("../models/goodsReceiptNoteModel");
const VendorBill = require("../models/vendorBillModel");
const ThreeWayMatch = require("../models/threeWayMatchModel");

async function runThreeWayMatch(purchaseOrderId, vendorBillId, organizationId) {
  const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, organization: organizationId });
  const bill = await VendorBill.findOne({ _id: vendorBillId, organization: organizationId });
  
  if (!po || !bill) {
    throw new Error("PO or Vendor Bill not found");
  }

  const grns = await GoodsReceiptNote.find({
    purchaseOrder: po._id,
    organization: organizationId,
    status: "confirmed"
  });

  const poLineMap = new Map(); // poLineId -> { orderedQty, unitCost }
  for (const line of po.lines) {
    poLineMap.set(String(line._id), { ordered: line.quantityOrdered, cost: line.unitCost, ingredient: String(line.ingredient) });
  }

  const recvMap = new Map(); // poLineId -> totalReceived
  for (const grn of grns) {
    for (const line of grn.lines) {
      const lid = line.purchaseOrderLineId;
      const recvQty = Number(line.quantityReceived) || Number(line.receivedQty) || 0;
      recvMap.set(lid, (recvMap.get(lid || "") || 0) + recvQty);
    }
  }

  const billedMap = new Map(); // ingredient -> { qty, cost }
  for (const line of bill.lines) {
    if (line.ingredient) {
      const iid = String(line.ingredient);
      const prev = billedMap.get(iid) || { qty: 0, cost: 0 };
      billedMap.set(iid, { qty: prev.qty + line.quantity, cost: line.unitPrice });
    }
  }

  let status = "matched";
  let notes = "";

  // Check Qty: Billed vs Received vs Ordered
  for (const [lid, poInfo] of poLineMap.entries()) {
    const received = recvMap.get(lid) || 0;
    const billed = billedMap.get(poInfo.ingredient)?.qty || 0;

    if (Math.abs(billed - received) > 0.001) {
      status = "quantity_mismatch";
      notes += `Qty mismatch for ${poInfo.ingredient}: Received=${received}, Billed=${billed}. `;
    }
    
    // Check Price: PO Unit Cost vs Bill Unit Cost
    const billedCost = billedMap.get(poInfo.ingredient)?.cost || 0;
    if (Math.abs(poInfo.cost - billedCost) > 0.001 && billed > 0) {
      if (status === "matched") status = "price_mismatch";
      notes += `Price mismatch for ${poInfo.ingredient}: PO Cost=${poInfo.cost}, Bill Cost=${billedCost}. `;
    }
  }

  // Handle items billed but not on PO
  for (const [iid, billInfo] of billedMap.entries()) {
    const onPo = Array.from(poLineMap.values()).some(v => v.ingredient === iid);
    if (!onPo) {
      status = "quantity_mismatch";
      notes += `Item ${iid} billed but not on PO. `;
    }
  }

  // Update or Create Match record
  return ThreeWayMatch.findOneAndUpdate(
    { organization: organizationId, purchaseOrder: po._id, vendorBill: bill._id },
    { $set: { matchStatus: status, discrepancyNotes: notes.trim(), lastMatchedAt: new Date() } },
    { upsert: true, new: true }
  );
}

module.exports = {
  runThreeWayMatch,
};
