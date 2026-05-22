const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Combo = require("../models/comboModel");
const MenuItem = require("../models/menuItemModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const { assertTenantOrganization } = require("../utils/tenantOrg");

function normalizeSlots(slots) {
  if (!Array.isArray(slots)) return [];
  return slots
    .map((slot) => ({
      name: String(slot?.name || "").trim(),
      required: slot?.required !== undefined ? Boolean(slot.required) : true,
      items: Array.isArray(slot?.items)
        ? slot.items
            .map((entry) => ({
              menuItemId: String(entry?.menuItemId || ""),
            }))
            .filter((entry) => mongoose.Types.ObjectId.isValid(entry.menuItemId))
        : [],
    }))
    .filter((slot) => slot.name.length > 0);
}

async function assertComboItemsExist(organizationId, slots) {
  const menuItemIds = slots.flatMap((slot) =>
    slot.items.map((entry) => new mongoose.Types.ObjectId(String(entry.menuItemId)))
  );
  if (menuItemIds.length === 0) return;
  const count = await MenuItem.countDocuments({
    _id: { $in: menuItemIds },
    organization: organizationId,
  });
  if (count !== menuItemIds.length) {
    throw createHttpError(400, "All combo slot items must exist in the organization.");
  }
}

const listCombos = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const pag = parsePaginationQuery(req.query);
    const filter = { organization: orgId, location: req.locationScopeId };
    const [data, total] = await Promise.all([
      Combo.find(filter).sort({ name: 1 }).skip(pag.skip).limit(pag.limit).lean(),
      Combo.countDocuments(filter),
    ]);
    res.status(200).json({
      success: true,
      data,
      page: pag.page,
      limit: pag.limit,
      total,
    });
  } catch (error) {
    next(error);
  }
};

const createCombo = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const name = String(req.body?.name || "").trim();
    const type = String(req.body?.type || "").trim().toLowerCase();
    const price = Number(req.body?.price || 0);
    if (!name) return next(createHttpError(400, "name is required."));
    if (!["fixed", "choice"].includes(type)) {
      return next(createHttpError(400, "type must be fixed or choice."));
    }
    if (!Number.isFinite(price) || price < 0) {
      return next(createHttpError(400, "price must be a non-negative number."));
    }
    const slots = normalizeSlots(req.body?.slots);
    await assertComboItemsExist(orgId, slots);
    const created = await Combo.create({
      organization: orgId,
      location: req.locationScopeId,
      name,
      description: String(req.body?.description || "").trim(),
      price,
      type,
      slots,
      image: String(req.body?.image || "").trim(),
      isActive: req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true,
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

const updateCombo = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid combo id."));
    }
    const slots = normalizeSlots(req.body?.slots);
    await assertComboItemsExist(orgId, slots);
    const payload = {
      name: String(req.body?.name || "").trim(),
      description: String(req.body?.description || "").trim(),
      price: Number(req.body?.price || 0),
      type: String(req.body?.type || "").trim().toLowerCase(),
      slots,
      image: String(req.body?.image || "").trim(),
      isActive: req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true,
    };
    const updated = await Combo.findOneAndUpdate(
      { _id: id, organization: orgId, location: req.locationScopeId },
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!updated) return next(createHttpError(404, "Combo not found."));
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const deleteCombo = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid combo id."));
    }
    const deleted = await Combo.findOneAndDelete({
      _id: id,
      organization: orgId,
      location: req.locationScopeId,
    });
    if (!deleted) return next(createHttpError(404, "Combo not found."));
    res.status(200).json({ success: true, message: "Combo deleted." });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listCombos,
  createCombo,
  updateCombo,
  deleteCombo,
};

