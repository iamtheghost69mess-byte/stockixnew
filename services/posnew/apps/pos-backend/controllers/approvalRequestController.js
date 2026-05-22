const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const ApprovalRequest = require("../models/approvalRequestModel");
const ExpenseReport = require("../models/expenseReportModel");
const JournalEntry = require("../models/journalEntryModel");
const VendorBill = require("../models/vendorBillModel");
const VendorReturn = require("../models/vendorReturnModel");
const { assertTenantOrganization } = require("../utils/tenantOrg");

/**
 * @param {unknown} orgId
 * @param {ReadonlyArray<Record<string, unknown>>} rows
 * @returns {Promise<ReadonlyArray<Record<string, unknown>>>}
 */
async function enrichApprovalRequests(orgId, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const vendorBillIds = new Set();
  const expenseIds = new Set();
  const returnIds = new Set();
  const journalIds = new Set();

  for (const r of rows) {
    const id = String(r.targetId);
    const tt = String(r.targetType || "");
    if (tt === "vendor_bill") vendorBillIds.add(id);
    else if (tt === "expense_report") expenseIds.add(id);
    else if (tt === "vendor_return") returnIds.add(id);
    else if (tt === "manual_journal") journalIds.add(id);
  }

  /** @type {Map<string, { targetSummary: string; targetDetailPath: string | null }>} */
  const meta = new Map();
  const oid = (s) => new mongoose.Types.ObjectId(s);

  const missingSummary = (targetType) => {
    switch (targetType) {
      case "vendor_bill":
        return "Vendor bill — record not found or inaccessible";
      case "expense_report":
        return "Expense report — record not found or inaccessible";
      case "vendor_return":
        return "Vendor return — record not found or inaccessible";
      case "manual_journal":
        return "Journal entry — record not found or inaccessible";
      default:
        return "Referenced record not found";
    }
  };

  if (vendorBillIds.size > 0) {
    const docs = await VendorBill.find({
      organization: orgId,
      _id: { $in: [...vendorBillIds].map(oid) },
    })
      .select("vendorBillNumber supplier")
      .populate({ path: "supplier", select: "name" })
      .lean();
    for (const d of docs) {
      const id = String(d._id);
      const supplierName =
        d.supplier && typeof d.supplier === "object" && "name" in d.supplier && d.supplier.name
          ? String(d.supplier.name)
          : "";
      const num = String(d.vendorBillNumber ?? "");
      const summary = supplierName
        ? `Vendor bill ${num} · ${supplierName}`
        : `Vendor bill ${num}`;
      meta.set(`vendor_bill:${id}`, {
        targetSummary: summary,
        targetDetailPath: `/dashboard/accounting/vendor-bills/${id}`,
      });
    }
  }

  if (expenseIds.size > 0) {
    const docs = await ExpenseReport.find({
      organization: orgId,
      _id: { $in: [...expenseIds].map(oid) },
    })
      .select("expenseNumber total currency")
      .lean();
    for (const d of docs) {
      const id = String(d._id);
      const num = String(d.expenseNumber ?? "");
      const cur = String(d.currency || "USD").toUpperCase();
      const total = typeof d.total === "number" ? d.total : 0;
      const amt = new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(total);
      meta.set(`expense_report:${id}`, {
        targetSummary: `Expense report ${num} · ${amt}`,
        targetDetailPath: `/dashboard/accounting/expense-reports/${id}`,
      });
    }
  }

  if (returnIds.size > 0) {
    const docs = await VendorReturn.find({
      organization: orgId,
      _id: { $in: [...returnIds].map(oid) },
    })
      .select("returnNumber")
      .lean();
    for (const d of docs) {
      const id = String(d._id);
      const num = String(d.returnNumber ?? "");
      meta.set(`vendor_return:${id}`, {
        targetSummary: `Vendor return ${num}`,
        targetDetailPath: `/dashboard/inventory/vendor-returns/${id}`,
      });
    }
  }

  if (journalIds.size > 0) {
    const docs = await JournalEntry.find({
      organization: orgId,
      _id: { $in: [...journalIds].map(oid) },
    })
      .select("entryNumber memo")
      .lean();
    for (const d of docs) {
      const id = String(d._id);
      const n = d.entryNumber;
      const memo = String(d.memo || "").trim();
      const memoShort = memo.length > 52 ? `${memo.slice(0, 52)}…` : memo;
      const mid = memoShort ? ` · ${memoShort}` : "";
      meta.set(`manual_journal:${id}`, {
        targetSummary: `Journal entry #${n}${mid}`,
        targetDetailPath: `/dashboard/accounting/journal/${id}`,
      });
    }
  }

  return rows.map((r) => {
    const tid = String(r.targetId);
    const tt = String(r.targetType || "");
    const key = `${tt}:${tid}`;
    const m = meta.get(key);
    const out = {
      ...r,
      targetId: tid,
      _id: String(r._id),
      targetSummary: m ? m.targetSummary : missingSummary(tt),
      targetDetailPath: m ? m.targetDetailPath : null,
    };
    return out;
  });
}

const listApprovalRequests = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { status, targetType } = req.query;
    const q = { organization: orgId };
    if (status && ["pending", "approved", "rejected"].includes(String(status))) {
      q.status = String(status);
    }
    if (targetType) {
      q.targetType = String(targetType);
    }
    const rows = await ApprovalRequest.find(q).sort({ createdAt: -1 }).limit(200).lean();
    const data = await enrichApprovalRequests(orgId, rows);
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const createApprovalRequest = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { targetType, targetId, notes } = req.body || {};
    const tt = String(targetType || "").trim();
    if (!["vendor_bill", "manual_journal", "expense_report", "vendor_return"].includes(tt)) {
      return next(createHttpError(400, "Invalid targetType"));
    }
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return next(createHttpError(400, "Invalid targetId"));
    }
    const tid = new mongoose.Types.ObjectId(String(targetId));

    if (tt === "vendor_bill") {
      const bill = await VendorBill.findOne({ _id: tid, organization: orgId });
      if (!bill) return next(createHttpError(404, "Vendor bill not found"));
      if (bill.status !== "draft") {
        return next(createHttpError(400, "Only draft vendor bills can enter approval."));
      }
    }
    if (tt === "expense_report") {
      const ex = await ExpenseReport.findOne({ _id: tid, organization: orgId });
      if (!ex) return next(createHttpError(404, "Expense report not found"));
      if (ex.status !== "submitted") {
        return next(createHttpError(400, "Only submitted expense reports can enter approval."));
      }
    }

    const pending = await ApprovalRequest.findOne({
      organization: orgId,
      targetType: tt,
      targetId: tid,
      status: "pending",
    });
    if (pending) {
      const plain = pending.toObject ? pending.toObject() : pending;
      const [enriched] = await enrichApprovalRequests(orgId, [plain]);
      return res.status(200).json({ success: true, data: enriched });
    }

    const doc = await ApprovalRequest.create({
      organization: orgId,
      targetType: tt,
      targetId: tid,
      status: "pending",
      notes: String(notes || "").trim().slice(0, 2000),
      requestedBy: req.user?._id || null,
    });
    const [createdOut] = await enrichApprovalRequests(orgId, [doc.toObject()]);
    res.status(201).json({ success: true, data: createdOut });
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(400, "A pending approval already exists for this target."));
    }
    next(e);
  }
};

const approveApprovalRequest = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await ApprovalRequest.findOne({
      _id: id,
      organization: orgId,
      status: "pending",
    });
    if (!doc) return next(createHttpError(404, "Pending approval not found"));

    doc.status = "approved";
    doc.resolvedBy = req.user?._id || null;
    doc.resolvedAt = new Date();
    await doc.save();

    if (doc.targetType === "expense_report") {
      await ExpenseReport.updateOne(
        {
          _id: doc.targetId,
          organization: orgId,
          status: "submitted",
        },
        {
          $set: {
            status: "approved",
            approvedAt: new Date(),
            approvedBy: req.user?._id || null,
          },
        }
      );
    }

    const [approvedOut] = await enrichApprovalRequests(orgId, [doc.toObject()]);
    res.status(200).json({ success: true, data: approvedOut });
  } catch (e) {
    next(e);
  }
};

const rejectApprovalRequest = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const reason = String(req.body?.reason || "").trim().slice(0, 2000);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await ApprovalRequest.findOne({
      _id: id,
      organization: orgId,
      status: "pending",
    });
    if (!doc) return next(createHttpError(404, "Pending approval not found"));

    doc.status = "rejected";
    doc.resolvedBy = req.user?._id || null;
    doc.resolvedAt = new Date();
    doc.notes = doc.notes ? `${doc.notes}\n${reason}` : reason;
    await doc.save();

    if (doc.targetType === "expense_report") {
      await ExpenseReport.updateOne(
        { _id: doc.targetId, organization: orgId, status: "submitted" },
        {
          $set: {
            status: "rejected",
            rejectedAt: new Date(),
            rejectedBy: req.user?._id || null,
            rejectReason: reason,
          },
        }
      );
    }

    const [rejectedOut] = await enrichApprovalRequests(orgId, [doc.toObject()]);
    res.status(200).json({ success: true, data: rejectedOut });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listApprovalRequests,
  createApprovalRequest,
  approveApprovalRequest,
  rejectApprovalRequest,
};
