const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Ingredient = require("../models/ingredientModel");
const Recipe = require("../models/recipeModel");
const { UNITS } = require("../models/ingredientModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const stockBalanceService = require("../services/stockBalanceService");
const { assertTenantOrganization } = require("../utils/tenantOrg");
const { deleteFileByUrl, isManagedUploadUrl } = require("../services/storageService");

function pickUnit(u) {
  if (u && UNITS.includes(u)) return u;
  return "g";
}

function cleanupManagedImage(url) {
  if (!url || !isManagedUploadUrl(url)) return;
  void deleteFileByUrl(url).catch(() => {
    /* non-fatal storage cleanup */
  });
}

const listIngredients = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const filter = { organization: orgId, location: req.locationScopeId };
    const st = req.query.status;
    if (st === "active" || st === "archived") filter.status = st;
    const cat = req.query.categoryId;
    if (cat && mongoose.Types.ObjectId.isValid(String(cat))) {
      filter.category = cat;
    }
    const pag = parsePaginationQuery(req.query);
    const base = Ingredient.find(filter)
      .populate("category", "name sortOrder")
      .sort({ name: 1 });

    const [items, total] = await Promise.all([
      base.clone().skip(pag.skip).limit(pag.limit),
      Ingredient.countDocuments(filter),
    ]);
    res.status(200).json({
      success: true,
      data: items,
      page: pag.page,
      limit: pag.limit,
      total,
    });
  } catch (e) {
    next(e);
  }
};

const createIngredient = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const b = req.body;
    if (!b.name || !String(b.name).trim()) {
      return next(createHttpError(400, "Name is required."));
    }
    const purchaseToStockFactor =
      b.purchaseToStockFactor != null
        ? Math.max(0.000001, Number(b.purchaseToStockFactor) || 1)
        : 1;
    let doc = await Ingredient.create({
      organization: orgId,
      location: req.locationScopeId,
      name: String(b.name).trim(),
      sku: b.sku != null ? String(b.sku).trim().slice(0, 64) : "",
      description: b.description != null ? String(b.description).trim() : "",
      category:
        b.category && mongoose.Types.ObjectId.isValid(String(b.category))
          ? b.category
          : null,
      imageUrl: b.imageUrl != null ? String(b.imageUrl).trim().slice(0, 500) : "",
      status:
        b.status === "archived" ? "archived" : "active",
      unit: pickUnit(b.unit),
      purchaseUnit:
        b.purchaseUnit && UNITS.includes(b.purchaseUnit)
          ? b.purchaseUnit
          : undefined,
      purchaseToStockFactor,
      currentStock: b.currentStock != null ? Math.max(0, Number(b.currentStock)) : 0,
      reorderThreshold:
        b.reorderThreshold != null ? Math.max(0, Number(b.reorderThreshold)) : 0,
      reorderQuantity:
        b.reorderQuantity != null ? Math.max(0, Number(b.reorderQuantity)) : 0,
      supplier: b.supplier != null ? String(b.supplier).trim() : "",
      unitCost: b.unitCost != null ? Math.max(0, Number(b.unitCost) || 0) : 0,
      averageUnitCost:
        b.averageUnitCost != null
          ? Math.max(0, Number(b.averageUnitCost) || 0)
          : 0,
      lastPurchaseUnitCost:
        b.lastPurchaseUnitCost != null
          ? Math.max(0, Number(b.lastPurchaseUnitCost) || 0)
          : 0,
    });
    if (doc.currentStock > 0) {
      try {
        await stockBalanceService.setOpeningBalanceAtDefault(
          doc._id,
          doc.currentStock
        );
        doc = await Ingredient.findById(doc._id).populate(
          "category",
          "name sortOrder"
        );
      } catch {
        /* no Location yet — stock stays on ingredient only */
      }
    }
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const updateIngredient = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid ingredient id."));
    }
    const ing = await Ingredient.findOne({
      _id: id,
      organization: orgId,
      location: req.locationScopeId,
    });
    if (!ing) return next(createHttpError(404, "Ingredient not found."));
    const b = req.body;
    const previousImageUrl = String(ing.imageUrl || "").trim();
    if (b.name !== undefined) ing.name = String(b.name).trim();
    if (b.sku !== undefined) ing.sku = String(b.sku).trim().slice(0, 64);
    if (b.description !== undefined) ing.description = String(b.description).trim();
    if (b.category !== undefined) {
      ing.category =
        b.category && mongoose.Types.ObjectId.isValid(String(b.category))
          ? b.category
          : null;
    }
    if (b.imageUrl !== undefined) {
      ing.imageUrl = String(b.imageUrl).trim().slice(0, 500);
    }
    if (b.status === "active" || b.status === "archived") ing.status = b.status;
    if (b.unit !== undefined) ing.unit = pickUnit(b.unit);
    if (b.purchaseUnit !== undefined) {
      ing.purchaseUnit =
        b.purchaseUnit && UNITS.includes(b.purchaseUnit)
          ? b.purchaseUnit
          : undefined;
    }
    if (b.purchaseToStockFactor !== undefined) {
      ing.purchaseToStockFactor = Math.max(
        0.000001,
        Number(b.purchaseToStockFactor) || 1
      );
    }
    if (b.currentStock !== undefined) {
      ing.currentStock = Math.max(0, Number(b.currentStock));
    }
    if (b.reorderThreshold !== undefined) {
      ing.reorderThreshold = Math.max(0, Number(b.reorderThreshold));
    }
    if (b.reorderQuantity !== undefined) {
      ing.reorderQuantity = Math.max(0, Number(b.reorderQuantity));
    }
    if (b.supplier !== undefined) ing.supplier = String(b.supplier).trim();
    if (b.unitCost !== undefined) {
      ing.unitCost = Math.max(0, Number(b.unitCost) || 0);
    }
    if (b.averageUnitCost !== undefined) {
      ing.averageUnitCost = Math.max(0, Number(b.averageUnitCost) || 0);
    }
    if (b.lastPurchaseUnitCost !== undefined) {
      ing.lastPurchaseUnitCost = Math.max(0, Number(b.lastPurchaseUnitCost) || 0);
    }
    await ing.save();
    const nextImageUrl = String(ing.imageUrl || "").trim();
    if (b.imageUrl !== undefined && previousImageUrl && previousImageUrl !== nextImageUrl) {
      cleanupManagedImage(previousImageUrl);
    }
    const populated = await Ingredient.findById(ing._id).populate(
      "category",
      "name sortOrder"
    );
    res.status(200).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

const deleteIngredient = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid ingredient id."));
    }
    const used = await Recipe.exists({
      organization: orgId,
      "ingredients.ingredient": id,
    });
    if (used) {
      return next(
        createHttpError(
          400,
          "Cannot delete an ingredient that is used in a recipe."
        )
      );
    }
    const StockBalance = require("../models/stockBalanceModel");
    await StockBalance.deleteMany({
      ingredient: id,
      organization: orgId,
      location: req.locationScopeId,
    });
    const ing = await Ingredient.findOneAndDelete({
      _id: id,
      organization: orgId,
      location: req.locationScopeId,
    });
    if (!ing) return next(createHttpError(404, "Ingredient not found."));
    cleanupManagedImage(ing.imageUrl);
    res.status(200).json({ success: true, message: "Ingredient removed." });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
};
