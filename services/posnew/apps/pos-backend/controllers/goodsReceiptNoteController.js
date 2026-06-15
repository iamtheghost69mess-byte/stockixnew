const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const GoodsReceiptNote = require("../models/goodsReceiptNoteModel");
const grnService = require("../services/grnService");
const { assertTenantOrganization } = require("../utils/tenantOrg");

const listGRNs = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { purchaseOrderId, supplierId, status } = req.query;
    const q = { organization: orgId };
    if (purchaseOrderId) q.purchaseOrder = purchaseOrderId;
    if (supplierId) q.supplier = supplierId;
    if (status) q.status = status;

    const rows = await GoodsReceiptNote.find(q)
      .populate("supplier", "name")
      .populate("location", "name")
      .populate("purchaseOrder", "reference")
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const getGRN = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const doc = await GoodsReceiptNote.findOne({ _id: id, organization: orgId })
      .populate("supplier")
      .populate("location")
      .populate("lines.ingredient", "name unit sku");
    if (!doc) return next(createHttpError(404, "GRN not found"));
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const createGRN = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { purchaseOrderId } = req.body;
    if (!purchaseOrderId) return next(createHttpError(400, "purchaseOrderId is required"));
    
    const doc = await grnService.createGRNFromPO(purchaseOrderId, orgId, req.user?._id);
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const updateGRN = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const doc = await GoodsReceiptNote.findOne({ _id: id, organization: orgId });
    if (!doc) return next(createHttpError(404, "GRN not found"));
    if (doc.status !== "draft") return next(createHttpError(400, "Cannot edit non-draft GRN"));

    const { lines, notes, supplierDeliveryNoteRef } = req.body;
    if (notes !== undefined) doc.notes = notes;
    if (supplierDeliveryNoteRef !== undefined) doc.supplierDeliveryNoteRef = supplierDeliveryNoteRef;
    
    if (Array.isArray(lines)) {
      // Simple update of received quantities and lot info
      for (const row of lines) {
        const line = doc.lines.id(row._id);
        if (line) {
          if (row.receivedQty !== undefined) {
            line.quantityReceived = Number(row.receivedQty);
          }
          if (row.quantityReceived !== undefined) {
            line.quantityReceived = Number(row.quantityReceived);
          }
          if (row.rejectedQty !== undefined) line.rejectedQty = Number(row.rejectedQty);
          if (row.unitCost !== undefined) line.unitCost = Number(row.unitCost);
          if (row.lotNumber !== undefined) line.lotNumber = row.lotNumber;
          if (row.expiryDate !== undefined) line.expiryDate = row.expiryDate;
          if (row.productionDate !== undefined) line.productionDate = row.productionDate;
          if (row.supplierBatchRef !== undefined) line.supplierBatchRef = row.supplierBatchRef;
          if (row.rejectionReason !== undefined) line.rejectionReason = row.rejectionReason;
        }
      }
    }

    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const confirmGRN = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const doc = await grnService.confirmGRN(id, orgId, req.user?._id, req);
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const ALLOWED_HEADER_TRANSITIONS = new Set([
  "qc_pending",
  "qc_failed",
  "confirmed",
]);
const ALLOWED_LINE_QC = new Set(["passed", "failed", "pending"]);

/**
 * POST /api/goods-receipt-notes/:id/qc
 * Body: {
 *   status: "qc_pending"|"qc_failed"|"confirmed",
 *   reason?: string,
 *   lineStatuses?: Array<{ lineId, qcStatus: "passed"|"failed"|"pending", reason? }>
 * }
 * Transitions the GRN header + per-line QC state with an audit trail in `notes`.
 */
const transitionQc = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const { status, reason, lineStatuses } = req.body || {};

    if (!ALLOWED_HEADER_TRANSITIONS.has(String(status))) {
      return next(
        createHttpError(
          400,
          "status must be one of: qc_pending, qc_failed, confirmed"
        )
      );
    }

    const doc = await GoodsReceiptNote.findOne({ _id: id, organization: orgId });
    if (!doc) return next(createHttpError(404, "GRN not found"));
    if (doc.status === "cancelled") {
      return next(createHttpError(400, "Cannot QC a cancelled GRN"));
    }

    if (Array.isArray(lineStatuses)) {
      for (const row of lineStatuses) {
        if (!row || !row.lineId || !mongoose.Types.ObjectId.isValid(row.lineId)) continue;
        const line = doc.lines.id(row.lineId);
        if (!line) continue;
        if (ALLOWED_LINE_QC.has(row.qcStatus)) {
          line.qcStatus = row.qcStatus;
        }
        if (typeof row.reason === "string" && row.reason.trim()) {
          line.rejectionReason = row.reason.trim().slice(0, 500);
        }
      }
    }

    doc.status = status;
    const stamp = new Date().toISOString();
    const actor = req.user?.email || req.user?._id || "system";
    const audit = `[${stamp}] QC -> ${status} by ${actor}${
      reason ? `: ${String(reason).slice(0, 500)}` : ""
    }`;
    doc.notes = doc.notes ? `${doc.notes}\n${audit}` : audit;

    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listGRNs,
  getGRN,
  createGRN,
  updateGRN,
  confirmGRN,
  transitionQc,
};
