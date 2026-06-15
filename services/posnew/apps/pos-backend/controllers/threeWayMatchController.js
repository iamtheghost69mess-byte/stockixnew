const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const ThreeWayMatch = require("../models/threeWayMatchModel");
const GoodsReceiptNote = require("../models/goodsReceiptNoteModel");
const { assertTenantOrganization } = require("../utils/tenantOrg");

/**
 * List all 3-way match records for the organization.
 */
const listMatches = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { status, purchaseOrderId, vendorBillId } = req.query;
    const q = { organization: orgId };

    if (status) q.matchStatus = status;
    if (purchaseOrderId && mongoose.Types.ObjectId.isValid(purchaseOrderId)) {
      q.purchaseOrder = purchaseOrderId;
    }
    if (vendorBillId && mongoose.Types.ObjectId.isValid(vendorBillId)) {
      q.vendorBill = vendorBillId;
    }

    const rows = await ThreeWayMatch.find(q)
      .populate("purchaseOrder", "reference status total supplier")
      .populate("vendorBill", "vendorBillNumber status total supplier")
      .sort({ updatedAt: -1 })
      .lean();

    // Populate supplier name from PO for both if possible
    // Note: In a real system, we'd populate the supplier model directly.
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

/**
 * Get a specific 3-way match audit record.
 */
const getMatch = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }

    const doc = await ThreeWayMatch.findOne({
      _id: id,
      organization: orgId,
    })
      .populate({
        path: "purchaseOrder",
        populate: { path: "lines.ingredient", select: "name unit sku" }
      })
      .populate({
        path: "vendorBill",
        populate: [
          { path: "supplier" },
          { path: "lines.ingredient", select: "name unit sku" }
        ]
      })
      .lean();

    if (!doc) return next(createHttpError(404, "Reconciliation record not found"));

    // Also fetch associated GRNs to show in the 3-way comparison
    const grns = await GoodsReceiptNote.find({
      purchaseOrder: doc.purchaseOrder._id,
      organization: orgId,
      status: "confirmed"
    }).populate("lines.ingredient", "name unit sku").lean();

    res.status(200).json({ 
      success: true, 
      data: {
        ...doc,
        associatedGrns: grns
      } 
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/reconciliation/:id/override
 * Body: { reason: string }
 * Marks the mismatch as manually accepted by an authorized user.
 */
const overrideMatch = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const reason = String(req.body?.reason || "").trim();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    if (!reason) {
      return next(createHttpError(400, "reason is required for override"));
    }

    const doc = await ThreeWayMatch.findOne({ _id: id, organization: orgId });
    if (!doc) return next(createHttpError(404, "Reconciliation record not found"));

    doc.matchStatus = "overridden";
    doc.discrepancyNotes = `${doc.discrepancyNotes || ""}\n[override] ${reason}`.trim();
    doc.actionHistory.push({
      action: "override",
      reason,
      performedBy: req.user?._id || null,
      performedByEmail: req.user?.email || "",
      performedAt: new Date(),
    });
    await doc.save();

    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/reconciliation/:id/resolve
 * Body: { resolution?: string }
 * Marks the reconciliation as resolved (the underlying PO/GRN/Bill diff has been corrected).
 */
const resolveMatch = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const resolution = String(req.body?.resolution || "").trim();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }

    const doc = await ThreeWayMatch.findOne({ _id: id, organization: orgId });
    if (!doc) return next(createHttpError(404, "Reconciliation record not found"));

    doc.matchStatus = "resolved";
    if (resolution) {
      doc.discrepancyNotes = `${doc.discrepancyNotes || ""}\n[resolved] ${resolution}`.trim();
    }
    doc.actionHistory.push({
      action: "resolve",
      reason: resolution,
      performedBy: req.user?._id || null,
      performedByEmail: req.user?.email || "",
      performedAt: new Date(),
    });
    await doc.save();

    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listMatches,
  getMatch,
  overrideMatch,
  resolveMatch,
};
