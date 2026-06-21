const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const IngredientCategory = require("../models/ingredientCategoryModel");
const { assertTenantOrganization } = require("../utils/tenantOrg");

const listCategories = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const items = await IngredientCategory.find({ organization: orgId })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    res.status(200).json({ success: true, data: items });
  } catch (e) {
    next(e);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { name, description, sortOrder, parentCategory, taxCode } = req.body;
    if (!name || !String(name).trim()) {
      return next(createHttpError(400, "Name is required."));
    }
    const doc = await IngredientCategory.create({
      organization: orgId,
      name: String(name).trim(),
      description: description != null ? String(description).trim() : "",
      sortOrder: sortOrder != null ? Number(sortOrder) || 0 : 0,
      parentCategory: parentCategory && mongoose.Types.ObjectId.isValid(parentCategory) ? parentCategory : null,
      taxCode: taxCode != null ? String(taxCode).trim() : null,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(400, "Category name already exists."));
    }
    next(e);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid category id."));
    }
    const c = await IngredientCategory.findOne({ _id: id, organization: orgId });
    if (!c) return next(createHttpError(404, "Category not found."));
    const b = req.body;
    if (b.name !== undefined) c.name = String(b.name).trim();
    if (b.description !== undefined) c.description = String(b.description).trim();
    if (b.sortOrder !== undefined) c.sortOrder = Number(b.sortOrder) || 0;
    if (b.taxCode !== undefined) c.taxCode = b.taxCode != null ? String(b.taxCode).trim() : null;
    if (b.parentCategory !== undefined) {
      c.parentCategory = b.parentCategory && mongoose.Types.ObjectId.isValid(b.parentCategory) ? b.parentCategory : null;
    }
    await c.save();
    res.status(200).json({ success: true, data: c });
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(400, "Category name already exists."));
    }
    next(e);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid category id."));
    }
    const IngredientModel = require("../models/ingredientModel");
    const [hasIngredients, hasChildren] = await Promise.all([
      IngredientModel.exists({ organization: orgId, category: id }),
      IngredientCategory.exists({ organization: orgId, parentCategory: id }),
    ]);

    if (hasIngredients) {
      return next(createHttpError(400, "Cannot delete a category still assigned to ingredients."));
    }
    if (hasChildren) {
      return next(createHttpError(400, "Cannot delete a category that has sub-categories. Delete or move sub-categories first."));
    }
    const c = await IngredientCategory.findOneAndDelete({
      _id: id,
      organization: orgId,
    });
    if (!c) return next(createHttpError(404, "Category not found."));
    res.status(200).json({ success: true, message: "Category removed." });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
