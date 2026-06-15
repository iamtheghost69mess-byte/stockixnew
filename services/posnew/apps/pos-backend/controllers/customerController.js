const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Customer = require("../models/customerModel");
const LoyaltyAccount = require("../models/loyaltyAccountModel");
const Order = require("../models/orderModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const { assertTenantOrganization } = require("../utils/tenantOrg");

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const listCustomers = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const q = String(req.query.search || "").trim();
    const search = q
      ? {
          $or: [
            { name: new RegExp(escapeRegex(q), "i") },
            { phone: new RegExp(escapeRegex(q), "i") },
            { loyaltyCard: new RegExp(escapeRegex(q), "i") },
          ],
        }
      : {};
    const filter = { organization: orgId, ...search };
    const pag = parsePaginationQuery(req.query);
    const sortQ = Customer.find(filter).sort({ name: 1 }).lean();

    let customers;
    let total;
    if (pag.active) {
      ;[customers, total] = await Promise.all([
        sortQ.clone().skip(pag.skip).limit(pag.limit),
        Customer.countDocuments(filter),
      ]);
    } else {
      customers = await sortQ.limit(500);
    }

    const ids = customers.map((c) => c._id);
    const accounts = await LoyaltyAccount.find({
      customer: { $in: ids },
    }).lean();
    const ptsByCust = new Map(
      accounts.map((a) => [String(a.customer), a.points])
    );
    const data = customers.map((c) => ({
      ...c,
      loyaltyPoints: ptsByCust.get(String(c._id)) ?? 0,
    }));
    if (pag.active) {
      return res.status(200).json({
        success: true,
        data,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const createCustomer = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { name, email, phone, loyaltyCard, vatNumber, notes, isBillingCustomer } = req.body;
    if (!name || !String(name).trim()) {
      return next(createHttpError(400, "Name is required."));
    }
    const normalizedEmail = email != null ? String(email).trim().toLowerCase() : "";
    const normalizedVatNumber = vatNumber != null ? String(vatNumber).trim() : "";
    const inferredBilling =
      normalizedEmail.length > 0 || normalizedVatNumber.length > 0;
    const doc = await Customer.create({
      organization: orgId,
      name: String(name).trim(),
      email: normalizedEmail,
      phone: phone != null ? String(phone).trim() : "",
      loyaltyCard: loyaltyCard != null ? String(loyaltyCard).trim() : undefined,
      vatNumber: normalizedVatNumber,
      isBillingCustomer: isBillingCustomer != null ? Boolean(isBillingCustomer) : inferredBilling,
      notes: notes != null ? String(notes).trim() : "",
    });
    await LoyaltyAccount.create({ customer: doc._id, points: 0, history: [] });
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(400, "Loyalty card must be unique."));
    }
    next(e);
  }
};

const updateCustomer = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id."));
    }
    const c = await Customer.findOne({ _id: id, organization: orgId });
    if (!c) return next(createHttpError(404, "Customer not found."));
    const { name, email, phone, loyaltyCard, vatNumber, notes, isBillingCustomer } = req.body;
    if (name !== undefined) c.name = String(name).trim();
    if (email !== undefined) c.email = String(email).trim().toLowerCase();
    if (phone !== undefined) c.phone = String(phone).trim();
    if (loyaltyCard !== undefined) {
      c.loyaltyCard = loyaltyCard ? String(loyaltyCard).trim() : undefined;
    }
    if (vatNumber !== undefined) c.vatNumber = String(vatNumber).trim();
    if (isBillingCustomer !== undefined) c.isBillingCustomer = Boolean(isBillingCustomer);
    if (isBillingCustomer === undefined && (email !== undefined || vatNumber !== undefined)) {
      const inferredBilling = Boolean(c.email?.trim() || c.vatNumber?.trim());
      c.isBillingCustomer = inferredBilling;
    }
    if (notes !== undefined) c.notes = String(notes).trim();
    await c.save();
    res.status(200).json({ success: true, data: c });
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(400, "Loyalty card must be unique."));
    }
    next(e);
  }
};

const getCustomerOrders = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id."));
    }
    const cust = await Customer.findOne({ _id: id, organization: orgId }).select("_id").lean();
    if (!cust) return next(createHttpError(404, "Customer not found."));
    const orders = await Order.find({ customer: id, organization: orgId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .select("orderStatus bills table orderDate paidAt createdAt")
      .populate("table", "tableNo")
      .lean();
    res.status(200).json({ success: true, data: orders });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listCustomers,
  createCustomer,
  updateCustomer,
  getCustomerOrders,
};
