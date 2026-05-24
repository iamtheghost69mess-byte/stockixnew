const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const IngredientSupplier = require("../models/ingredientSupplierModel");
const Ingredient = require("../models/ingredientModel");
const Supplier = require("../models/supplierModel");
const { assertTenantOrganization } = require("../utils/tenantOrg");

const listForIngredient = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { ingredientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(ingredientId)) {
      return next(createHttpError(400, "Invalid ingredient id."));
    }
    const ingOk = await Ingredient.exists({
      _id: ingredientId,
      organization: orgId,
    });
    if (!ingOk) {
      return next(createHttpError(404, "Ingredient not found."));
    }
    const rows = await IngredientSupplier.find({
      ingredient: ingredientId,
      organization: orgId,
    })
      .populate("supplier", "name code phone email defaultLeadTimeDays status")
      .sort({ isPreferred: -1, createdAt: 1 })
      .lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const upsertLink = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { ingredientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(ingredientId)) {
      return next(createHttpError(400, "Invalid ingredient id."));
    }
    const ing = await Ingredient.findOne({
      _id: ingredientId,
      organization: orgId,
    });
    if (!ing) return next(createHttpError(404, "Ingredient not found."));

    const {
      supplierId,
      unitPrice,
      minimumOrderQty,
      leadTimeDays,
      isPreferred,
      supplierSku,
      notes,
    } = req.body;
    if (!supplierId || !mongoose.Types.ObjectId.isValid(supplierId)) {
      return next(createHttpError(400, "Valid supplierId is required."));
    }
    const supOk = await Supplier.exists({
      _id: supplierId,
      organization: orgId,
    });
    if (!supOk) {
      return next(createHttpError(404, "Supplier not found."));
    }

    if (isPreferred) {
      await IngredientSupplier.updateMany(
        { ingredient: ingredientId, organization: orgId },
        { $set: { isPreferred: false } }
      );
    }

    const doc = await IngredientSupplier.findOneAndUpdate(
      {
        ingredient: ingredientId,
        supplier: supplierId,
        organization: orgId,
      },
      {
        $set: {
          unitPrice:
            unitPrice != null ? Math.max(0, Number(unitPrice) || 0) : 0,
          minimumOrderQty:
            minimumOrderQty != null
              ? Math.max(0, Number(minimumOrderQty) || 0)
              : 0,
          leadTimeDays:
            leadTimeDays != null ? Math.max(0, Number(leadTimeDays) || 0) : 0,
          isPreferred: Boolean(isPreferred),
          supplierSku:
            supplierSku != null ? String(supplierSku).slice(0, 120) : "",
          notes: notes != null ? String(notes).slice(0, 500) : "",
        },
        $setOnInsert: {
          organization: orgId,
          ingredient: ingredientId,
          supplier: supplierId,
        },
      },
      { upsert: true, new: true, runValidators: true }
    )
      .populate("supplier", "name code")
      .lean();

    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const removeLink = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { ingredientId, supplierId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(ingredientId) ||
      !mongoose.Types.ObjectId.isValid(supplierId)
    ) {
      return next(createHttpError(400, "Invalid id."));
    }
    const r = await IngredientSupplier.findOneAndDelete({
      ingredient: ingredientId,
      supplier: supplierId,
      organization: orgId,
    });
    if (!r) return next(createHttpError(404, "Link not found."));
    res.status(200).json({ success: true, message: "Link removed." });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listForIngredient,
  upsertLink,
  removeLink,
};
