const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const VendorBill = require("../models/vendorBillModel");
const accountingService = require("../services/accountingService");
const { assertTenantOrganization } = require("../utils/tenantOrg");

const listVendorBills = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { status, supplierId } = req.query;
    const q = { organization: orgId };
    if (status) q.status = status;
    if (supplierId && mongoose.Types.ObjectId.isValid(supplierId)) {
      q.supplier = supplierId;
    }
    const rows = await VendorBill.find(q)
      .populate("supplier", "name code")
      .populate("purchaseOrder", "reference")
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const getVendorBill = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await VendorBill.findOne({
      _id: id,
      organization: orgId,
    })
      .populate("supplier")
      .populate("purchaseOrder")
      .populate("lines.ingredient", "name unit sku");
    if (!doc) return next(createHttpError(404, "Not found"));
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const createVendorBillFromPO = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { purchaseOrderId, billDate, dueDate, currency } = req.body;
    if (!purchaseOrderId || !mongoose.Types.ObjectId.isValid(purchaseOrderId)) {
      return next(createHttpError(400, "Valid purchaseOrderId is required."));
    }
    const bill = await accountingService.createVendorBillFromPO(
      purchaseOrderId,
      { billDate, dueDate, currency },
      req.user?._id
    );
    res.status(201).json({ success: true, data: bill });
  } catch (e) {
    next(e);
  }
};

const postVendorBill = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const bill = await accountingService.postVendorBill(id, req.user?._id, orgId);
    res.status(200).json({ success: true, data: bill });
  } catch (e) {
    next(e);
  }
};

const recordPayment = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const { amount, method, date } = req.body;
    if (!amount || amount <= 0) {
      return next(createHttpError(400, "Positive amount is required"));
    }
    if (!method || String(method).trim() === "") {
      return next(createHttpError(400, "Payment method is required."));
    }
    const bill = await accountingService.recordVendorBillPayment(
      id,
      amount,
      { method, date },
      req.user?._id,
      orgId
    );
    res.status(200).json({ success: true, data: bill });
  } catch (e) {
    next(e);
  }
};

const voidVendorBill = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const bill = await accountingService.voidVendorBill(id, req.user?._id, orgId);
    res.status(200).json({ success: true, data: bill });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listVendorBills,
  getVendorBill,
  createVendorBillFromPO,
  postVendorBill,
  recordPayment,
  voidVendorBill,
};
