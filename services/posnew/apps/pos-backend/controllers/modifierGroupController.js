const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const ModifierGroup = require("../models/modifierGroupModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const { assertTenantOrganization } = require("../utils/tenantOrg");

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((option) => ({
      name: String(option?.name || "").trim(),
      priceAdjustment: Number(option?.priceAdjustment || 0),
    }))
    .filter((option) => option.name.length > 0);
}

function normalizePayload(body) {
  const minSelections = Math.max(0, Number(body?.minSelections ?? 1) || 0);
  const maxSelections = Math.max(1, Number(body?.maxSelections ?? 1) || 1);
  return {
    name: String(body?.name || "").trim(),
    type: String(body?.type || "").trim().toLowerCase(),
    required: Boolean(body?.required),
    minSelections,
    maxSelections: Math.max(maxSelections, minSelections),
    options: normalizeOptions(body?.options),
    isActive: body?.isActive !== undefined ? Boolean(body.isActive) : true,
  };
}

const listModifierGroups = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const pag = parsePaginationQuery(req.query);
    const filter = {
      organization: orgId,
      location: req.locationScopeId,
    };
    const [data, total] = await Promise.all([
      ModifierGroup.find(filter).sort({ name: 1 }).skip(pag.skip).limit(pag.limit).lean(),
      ModifierGroup.countDocuments(filter),
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

const createModifierGroup = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const payload = normalizePayload(req.body);
    if (!payload.name) {
      return next(createHttpError(400, "name is required."));
    }
    if (!["variant", "addon"].includes(payload.type)) {
      return next(createHttpError(400, "type must be variant or addon."));
    }
    const created = await ModifierGroup.create({
      organization: orgId,
      location: req.locationScopeId,
      ...payload,
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

const updateModifierGroup = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid modifier group id."));
    }
    const payload = normalizePayload(req.body);
    const updated = await ModifierGroup.findOneAndUpdate(
      { _id: id, organization: orgId, location: req.locationScopeId },
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return next(createHttpError(404, "Modifier group not found."));
    }
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const deleteModifierGroup = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid modifier group id."));
    }
    const deleted = await ModifierGroup.findOneAndDelete({
      _id: id,
      organization: orgId,
      location: req.locationScopeId,
    });
    if (!deleted) {
      return next(createHttpError(404, "Modifier group not found."));
    }
    res.status(200).json({ success: true, message: "Modifier group deleted." });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listModifierGroups,
  createModifierGroup,
  updateModifierGroup,
  deleteModifierGroup,
};

