const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const SplitBill = require("../models/splitBillModel");
const Order = require("../models/orderModel");
const PosAuditLog = require("../models/posAuditLogModel");
const { assertTenantOrganization } = require("../utils/tenantOrg");

function normalizeSplitStatus(entry) {
  const paidAmount = Number(entry.paidAmount || 0);
  const amount = Number(entry.amount || 0);
  if (amount <= 0) return "paid";
  if (paidAmount >= amount) return "paid";
  if (paidAmount > 0) return "partial";
  return "pending";
}

function summarizeSplitBill(splitBill) {
  const paidAmount = (splitBill.splits || []).reduce(
    (sum, split) => sum + Number(split.paidAmount || 0),
    0
  );
  const totalAmount = Number(splitBill.totalAmount || 0);
  const status =
    paidAmount >= totalAmount ? "paid" : paidAmount > 0 ? "partial" : "pending";
  return { paidAmount, status };
}

const listSplitBills = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { orderId } = req.query;
    const query = { organization: orgId };
    if (req.locationScopeId) {
      query.location = req.locationScopeId;
    }
    if (orderId) {
      if (!mongoose.Types.ObjectId.isValid(String(orderId))) {
        return next(createHttpError(400, "Invalid orderId."));
      }
      query.order = orderId;
    }
    const rows = await SplitBill.find(query).sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

const createSplitBill = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { orderId, method, splits } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(String(orderId || ""))) {
      return next(createHttpError(400, "Valid orderId is required."));
    }
    const normalizedMethod = String(method || "").trim().toLowerCase();
    if (!["equal", "by_item", "custom"].includes(normalizedMethod)) {
      return next(createHttpError(400, "method must be equal, by_item, or custom."));
    }
    if (!Array.isArray(splits) || splits.length === 0) {
      return next(createHttpError(400, "splits must be a non-empty array."));
    }
    const order = await Order.findOne({
      _id: orderId,
      organization: orgId,
      ...(req.locationScopeId ? { location: req.locationScopeId } : {}),
    })
      .select("_id bills location orderStatus status")
      .lean();
    if (!order) return next(createHttpError(404, "Order not found."));
    if (String(order.orderStatus || "").toLowerCase() === "paid") {
      return next(createHttpError(400, "Cannot split a paid order."));
    }
    const totalAmount = Number(order.bills?.totalWithTax || 0);
    const normalizedSplits = splits.map((entry, idx) => {
      const amount = Number(entry?.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw createHttpError(400, `Split #${idx + 1} must have a positive amount.`);
      }
      const orderItemIds = Array.isArray(entry?.orderItemIds)
        ? entry.orderItemIds
            .map((value) => String(value || "").trim())
            .filter((value) => mongoose.Types.ObjectId.isValid(value))
        : [];
      return {
        label: entry?.label ? String(entry.label).trim() : `Split ${idx + 1}`,
        amount,
        paidAmount: 0,
        orderItemIds,
      };
    });
    const splitTotal = normalizedSplits.reduce((sum, split) => sum + Number(split.amount), 0);
    if (Math.abs(splitTotal - totalAmount) > 0.01) {
      return next(
        createHttpError(
          400,
          `Split total (${splitTotal.toFixed(2)}) must equal order total (${totalAmount.toFixed(2)}).`
        )
      );
    }
    await SplitBill.updateMany(
      { organization: orgId, order: orderId, status: { $in: ["pending", "partial"] } },
      { $set: { status: "paid", closedAt: new Date(), closedBy: req.user?._id || null } }
    );
    const created = await SplitBill.create({
      organization: orgId,
      location: order.location || req.locationScopeId || null,
      order: orderId,
      method: normalizedMethod,
      splits: normalizedSplits,
      totalAmount,
      paidAmount: 0,
      status: "pending",
    });
    await PosAuditLog.create({
      organization: orgId,
      location: order.location || req.locationScopeId || null,
      user: req.user?._id || null,
      action: "split_bill_created",
      metadata: {
        orderRef: String(orderId),
        splitCount: normalizedSplits.length,
        method: normalizedMethod,
      },
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

const recordSplitPayment = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id, splitId } = req.params;
    const { amount, paymentMethod } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
      return next(createHttpError(400, "Invalid split bill id."));
    }
    if (!mongoose.Types.ObjectId.isValid(String(splitId || ""))) {
      return next(createHttpError(400, "Invalid split id."));
    }
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return next(createHttpError(400, "amount must be a positive number."));
    }
    const doc = await SplitBill.findOne({
      _id: id,
      organization: orgId,
      ...(req.locationScopeId ? { location: req.locationScopeId } : {}),
    });
    if (!doc) return next(createHttpError(404, "Split bill not found."));
    const splitEntry = doc.splits.id(splitId);
    if (!splitEntry) return next(createHttpError(404, "Split entry not found."));
    splitEntry.paidAmount = Number(splitEntry.paidAmount || 0) + paymentAmount;
    splitEntry.paymentMethod = String(paymentMethod || "").trim();
    splitEntry.paidAt = new Date();
    splitEntry.status = normalizeSplitStatus(splitEntry);
    const summary = summarizeSplitBill(doc);
    doc.paidAmount = summary.paidAmount;
    doc.status = summary.status;
    if (summary.status === "paid") {
      doc.closedAt = new Date();
      doc.closedBy = req.user?._id || null;
    }
    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listSplitBills,
  createSplitBill,
  recordSplitPayment,
};
