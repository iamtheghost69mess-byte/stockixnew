const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const ExpenseReport = require("../models/expenseReportModel");
const ApprovalRequest = require("../models/approvalRequestModel");
const AccountingConfig = require("../models/accountingConfigModel");
const accountingService = require("../services/accountingService");
const { assertTenantOrganization } = require("../utils/tenantOrg");

function oid(x) {
  return x && mongoose.Types.ObjectId.isValid(x) ? x : null;
}

/**
 * @param {unknown} lines
 * @returns {Array<{ description: string; amount: number; glAccount: import("mongoose").Types.ObjectId; attachmentUrl: string }>}
 */
function normalizeLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw createHttpError(400, "At least one expense line is required.");
  }
  return lines.map((l) => {
    const amount = accountingService.round2(Number(l.amount) || 0);
    if (amount <= 0) {
      throw createHttpError(400, "Each line must have a positive amount.");
    }
    const gl = oid(l.glAccount);
    if (!gl) {
      throw createHttpError(400, "Each line needs a valid glAccount id.");
    }
    const description = String(l.description || "").trim();
    if (!description) {
      throw createHttpError(400, "Each line needs a description.");
    }
    const attachmentUrl = String(l.attachmentUrl || "").trim().slice(0, 2048);
    return { description, amount, glAccount: gl, attachmentUrl };
  });
}

const listExpenseReports = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const rows = await ExpenseReport.find({ organization: orgId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const getExpenseReport = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await ExpenseReport.findOne({ _id: id, organization: orgId })
      .populate("lines.glAccount", "code name type")
      .lean();
    if (!doc) return next(createHttpError(404, "Not found"));
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const createExpenseReport = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { lines, notes, currency } = req.body || {};
    const normalized = normalizeLines(lines);
    const n = await accountingService.nextSequence("expenseReport", orgId);
    const expenseNumber = `EXP-${String(n).padStart(5, "0")}`;
    const total = accountingService.round2(
      normalized.reduce((s, l) => s + l.amount, 0)
    );
    const doc = await ExpenseReport.create({
      organization: orgId,
      expenseNumber,
      status: "draft",
      currency: String(currency || "USD").toUpperCase().trim() || "USD",
      lines: normalized,
      total,
      notes: String(notes || "").trim().slice(0, 4000),
      createdBy: req.user?._id || null,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const updateExpenseReport = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const report = await ExpenseReport.findOne({ _id: id, organization: orgId });
    if (!report) return next(createHttpError(404, "Not found"));
    if (report.status !== "draft") {
      return next(createHttpError(400, "Only draft expense reports can be edited."));
    }
    const { lines, notes, currency } = req.body || {};
    if (lines != null) {
      const normalized = normalizeLines(lines);
      report.lines = normalized;
      report.total = accountingService.round2(
        normalized.reduce((s, l) => s + l.amount, 0)
      );
    }
    if (notes !== undefined) {
      report.notes = String(notes || "").trim().slice(0, 4000);
    }
    if (currency !== undefined) {
      report.currency = String(currency || "USD").toUpperCase().trim() || "USD";
    }
    await report.save();
    res.status(200).json({ success: true, data: report });
  } catch (e) {
    next(e);
  }
};

const submitExpenseReport = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const report = await ExpenseReport.findOne({ _id: id, organization: orgId });
    if (!report) return next(createHttpError(404, "Not found"));
    if (report.status !== "draft") {
      return next(createHttpError(400, "Only draft reports can be submitted."));
    }
    if (!report.lines?.length) {
      return next(createHttpError(400, "Add lines before submitting."));
    }

    report.status = "submitted";
    report.submittedAt = new Date();
    await report.save();

    const cfg = await AccountingConfig.findOne({ organization: orgId })
      .select("requireApprovalsForExpensePosting")
      .lean();
    if (cfg?.requireApprovalsForExpensePosting) {
      const pending = await ApprovalRequest.findOne({
        organization: orgId,
        targetType: "expense_report",
        targetId: report._id,
        status: "pending",
      });
      if (!pending) {
        await ApprovalRequest.create({
          organization: orgId,
          targetType: "expense_report",
          targetId: report._id,
          status: "pending",
          notes: "",
          requestedBy: req.user?._id || null,
        });
      }
    }

    res.status(200).json({ success: true, data: report });
  } catch (e) {
    next(e);
  }
};

/** Direct document approval when org does not require formal `ApprovalRequest` for expense GL. */
const approveExpenseReportDirect = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const cfg = await AccountingConfig.findOne({ organization: orgId })
      .select("requireApprovalsForExpensePosting")
      .lean();
    if (cfg?.requireApprovalsForExpensePosting) {
      return next(
        createHttpError(
          400,
          "Expense approvals are enforced via the approvals inbox; use that flow instead."
        )
      );
    }
    const report = await ExpenseReport.findOne({
      _id: id,
      organization: orgId,
      status: "submitted",
    });
    if (!report) return next(createHttpError(404, "Submitted report not found"));
    report.status = "approved";
    report.approvedAt = new Date();
    report.approvedBy = req.user?._id || null;
    await report.save();
    res.status(200).json({ success: true, data: report });
  } catch (e) {
    next(e);
  }
};

const rejectExpenseReportDirect = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const reason = String(req.body?.reason || "").trim().slice(0, 2000);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const cfg = await AccountingConfig.findOne({ organization: orgId })
      .select("requireApprovalsForExpensePosting")
      .lean();
    if (cfg?.requireApprovalsForExpensePosting) {
      return next(
        createHttpError(
          400,
          "Expense rejections use the approvals inbox when formal approvals are enabled."
        )
      );
    }
    const report = await ExpenseReport.findOne({
      _id: id,
      organization: orgId,
      status: "submitted",
    });
    if (!report) return next(createHttpError(404, "Submitted report not found"));
    report.status = "rejected";
    report.rejectedAt = new Date();
    report.rejectedBy = req.user?._id || null;
    report.rejectReason = reason;
    await report.save();
    res.status(200).json({ success: true, data: report });
  } catch (e) {
    next(e);
  }
};

const postExpenseReportGl = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const report = await ExpenseReport.findOne({ _id: id, organization: orgId });
    if (!report) return next(createHttpError(404, "Not found"));
    try {
      const entry = await accountingService.postExpenseReportToGl(
        report._id,
        req.user?._id || null
      );
      res.status(200).json({ success: true, data: entry });
    } catch (err) {
      const status = err.status || 400;
      return next(createHttpError(status, err.message || "Post failed"));
    }
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listExpenseReports,
  getExpenseReport,
  createExpenseReport,
  updateExpenseReport,
  submitExpenseReport,
  approveExpenseReportDirect,
  rejectExpenseReportDirect,
  postExpenseReportGl,
};
