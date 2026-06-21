const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const CreditNote = require("../models/creditNoteModel");
const accountingService = require("../services/accountingService");
const { assertTenantOrganization } = require("../utils/tenantOrg");

const listCreditNotes = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { customerId, invoiceId } = req.query;
    const q = { organization: orgId };
    if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
      q.customer = customerId;
    }
    if (invoiceId && mongoose.Types.ObjectId.isValid(invoiceId)) {
      q.invoice = invoiceId;
    }
    const rows = await CreditNote.find(q)
      .populate("customer", "name code")
      .populate("invoice", "invoiceNumber")
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const getCreditNote = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await CreditNote.findOne({
      _id: id,
      organization: orgId,
    })
      .populate("customer")
      .populate("invoice");
    if (!doc) return next(createHttpError(404, "Not found"));
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const issueCreditNote = async (req, res, next) => {
  try {
    const { invoiceId, amount, reason, issueDate, notes } = req.body;
    if (!invoiceId || !mongoose.Types.ObjectId.isValid(invoiceId)) {
      return next(createHttpError(400, "Valid invoiceId is required."));
    }
    const cn = await accountingService.issueCreditNote(
      invoiceId,
      { amount, reason, issueDate, notes },
      req.user?._id
    );
    res.status(201).json({ success: true, data: cn });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listCreditNotes,
  getCreditNote,
  issueCreditNote,
};
