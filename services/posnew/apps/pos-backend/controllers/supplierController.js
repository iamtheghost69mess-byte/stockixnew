const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Supplier = require("../models/supplierModel");
const IngredientCategory = require("../models/ingredientCategoryModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const { assertTenantOrganization } = require("../utils/tenantOrg");

function serializeSupplier(doc) {
  return {
    _id: String(doc._id),
    name: doc.name || "",
    contactName: doc.contactName || "",
    email: doc.email || "",
    phone: doc.phone || "",
    address: doc.address || "",
    categoryId:
      doc.category && typeof doc.category === "object"
        ? String(doc.category._id)
        : doc.category
          ? String(doc.category)
          : null,
    categoryName:
      doc.category && typeof doc.category === "object" && doc.category.name
        ? String(doc.category.name)
        : "",
    status: doc.status === "archived" ? "archived" : "active",
    active: doc.status !== "archived",
    createdAt: doc.createdAt,
  };
}

async function resolveSupplierCategoryId(orgId, rawCategoryId) {
  if (rawCategoryId == null || String(rawCategoryId).trim() === "") return null;
  const value = String(rawCategoryId).trim();
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw createHttpError(400, "Invalid category id.");
  }
  const exists = await IngredientCategory.exists({ _id: value, organization: orgId });
  if (!exists) {
    throw createHttpError(400, "Category must belong to this organization.");
  }
  return new mongoose.Types.ObjectId(value);
}

const listSuppliers = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { status, q, categoryId, sortBy, sortDir } = req.query;
    const filter = { organization: orgId };
    const st = req.query.status;
    if (st === "active" || st === "archived") filter.status = st;
    if (typeof q === "string" && q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { contactName: rx }, { email: rx }, { phone: rx }];
    }
    if (categoryId && mongoose.Types.ObjectId.isValid(String(categoryId))) {
      filter.category = new mongoose.Types.ObjectId(String(categoryId));
    }
    const pag = parsePaginationQuery(req.query);
    const sortable = new Set(["name", "createdAt", "status"]);
    const sortKey = sortable.has(String(sortBy || "")) ? String(sortBy) : "createdAt";
    const dir = String(sortDir || "").toLowerCase() === "asc" ? 1 : -1;
    const base = Supplier.find(filter)
      .populate("category", "name")
      .sort({ [sortKey]: dir, _id: -1 });

    if (pag.active) {
      const [items, total] = await Promise.all([
        base.clone().skip(pag.skip).limit(pag.limit).lean(),
        Supplier.countDocuments(filter),
      ]);
      return res.status(200).json({
        success: true,
        data: items.map(serializeSupplier),
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }

    const items = await base.lean();
    res.status(200).json({ success: true, data: items.map(serializeSupplier) });
  } catch (e) {
    next(e);
  }
};

const createSupplier = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const {
      name,
      code,
      phone,
      email,
      address,
      notes,
      defaultLeadTimeDays,
      status,
      contactName,
      categoryId,
    } = req.body;
    if (!name || !String(name).trim()) {
      return next(createHttpError(400, "Name is required."));
    }
    const parsedCategoryId = await resolveSupplierCategoryId(orgId, categoryId);
    const doc = await Supplier.create({
      organization: orgId,
      name: String(name).trim(),
      contactName: contactName != null ? String(contactName).trim() : "",
      category: parsedCategoryId,
      code: code != null ? String(code).trim() : "",
      phone: phone != null ? String(phone).trim() : "",
      email: email != null ? String(email).trim() : "",
      address: address != null ? String(address).trim() : "",
      notes: notes != null ? String(notes).trim() : "",
      defaultLeadTimeDays:
        defaultLeadTimeDays != null ? Math.max(0, Number(defaultLeadTimeDays)) : 0,
      status: status === "archived" ? "archived" : "active",
    });
    const populated = await Supplier.findById(doc._id).populate("category", "name").lean();
    res.status(201).json({ success: true, data: serializeSupplier(populated) });
  } catch (e) {
    next(e);
  }
};

const updateSupplier = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid supplier id."));
    }
    const s = await Supplier.findOne({ _id: id, organization: orgId });
    if (!s) return next(createHttpError(404, "Supplier not found."));
    const b = req.body;
    if (b.name !== undefined) s.name = String(b.name).trim();
    if (b.contactName !== undefined) s.contactName = String(b.contactName).trim();
    if (b.categoryId !== undefined) {
      s.category = await resolveSupplierCategoryId(orgId, b.categoryId);
    }
    if (b.code !== undefined) s.code = String(b.code).trim();
    if (b.phone !== undefined) s.phone = String(b.phone).trim();
    if (b.email !== undefined) s.email = String(b.email).trim();
    if (b.address !== undefined) s.address = String(b.address).trim();
    if (b.notes !== undefined) s.notes = String(b.notes).trim();
    if (b.defaultLeadTimeDays !== undefined) {
      s.defaultLeadTimeDays = Math.max(0, Number(b.defaultLeadTimeDays) || 0);
    }
    if (b.status === "active" || b.status === "archived") s.status = b.status;
    await s.save();
    const populated = await Supplier.findById(s._id).populate("category", "name").lean();
    res.status(200).json({ success: true, data: serializeSupplier(populated) });
  } catch (e) {
    next(e);
  }
};

const deleteSupplier = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid supplier id."));
    }
    const IngredientSupplier = require("../models/ingredientSupplierModel");
    const used = await IngredientSupplier.exists({
      organization: orgId,
      supplier: id,
    });
    if (used) {
      return next(
        createHttpError(
          400,
          "Cannot delete a supplier linked to ingredients. Archive instead."
        )
      );
    }
    const s = await Supplier.findOneAndDelete({
      _id: id,
      organization: orgId,
    });
    if (!s) return next(createHttpError(404, "Supplier not found."));
    res.status(200).json({ success: true, message: "Supplier removed." });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
