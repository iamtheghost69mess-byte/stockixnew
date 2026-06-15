const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const MenuItem = require("../models/menuItemModel");
const MenuItemVariant = require("../models/menuItemVariantModel");
const Category = require("../models/categoryModel");
const Ingredient = require("../models/ingredientModel");
const ModifierGroup = require("../models/modifierGroupModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const { emitPos } = require("../utils/socketEmit");
const { assertTenantOrganization } = require("../utils/tenantOrg");
const {
  dualPricesFromDoc,
  legacyMirrorFromDual,
} = require("../utils/menuItemPrices");
const {
  buildMenuCategoryRevenueIndex,
  menuCategoryPathFromMap,
} = require("../services/categoryRevenueResolveService");
const { deleteFileByUrl, isManagedUploadUrl } = require("../services/storageService");

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MENU_ITEM_CATEGORY_POPULATE = {
  path: "category",
  select: "name color sortOrder parentCategory revenueAccount",
  populate: [
    { path: "parentCategory", select: "name color" },
    { path: "revenueAccount", select: "code name type" },
  ],
};

/**
 * @param {import("mongoose").Document | Record<string, unknown>} doc
 * @param {Map<string, object>} categoryIndex
 * @returns {Record<string, unknown>}
 */
function menuItemToResponse(doc, categoryIndex) {
  const o = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const cat = o.category;
  const leafId =
    cat != null && typeof cat === "object" && cat._id != null ? String(cat._id) : null;
  if (leafId && categoryIndex && categoryIndex.size > 0) {
    o.categoryFullPath = menuCategoryPathFromMap(leafId, categoryIndex);
  }
  return o;
}

function cleanupManagedImage(url) {
  if (!url || !isManagedUploadUrl(url)) return;
  void deleteFileByUrl(url).catch(() => {
    /* non-fatal storage cleanup */
  });
}

const listMenuItems = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { category, available, showOnPOS, search } = req.query;
    const filter = { organization: orgId };

    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return next(createHttpError(400, "Invalid category id."));
      }
      filter.category = category;
    }

    if (available === "true") {
      filter.isAvailable = true;
    } else if (available === "false") {
      filter.isAvailable = false;
    }
    if (showOnPOS === "true") {
      filter.showOnPOS = true;
    } else if (showOnPOS === "false") {
      filter.showOnPOS = false;
    }

    if (search && String(search).trim()) {
      filter.name = new RegExp(escapeRegex(String(search).trim()), "i");
    }

    const pag = parsePaginationQuery(req.query);
    const categoryIndex = await buildMenuCategoryRevenueIndex(orgId);
    const base = MenuItem.find(filter).populate(MENU_ITEM_CATEGORY_POPULATE).sort({ name: 1 });

    const [items, total] = await Promise.all([
      base.clone().skip(pag.skip).limit(pag.limit),
      MenuItem.countDocuments(filter),
    ]);
    const data = items.map((doc) => menuItemToResponse(doc, categoryIndex));
    res.status(200).json({
      success: true,
      data,
      page: pag.page,
      limit: pag.limit,
      total,
    });
  } catch (e) {
    next(e);
  }
};

const getMenuItem = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid menu item id."));
    }
    const [item, categoryIndex] = await Promise.all([
      MenuItem.findOne({ _id: id, organization: orgId }).populate(MENU_ITEM_CATEGORY_POPULATE),
      buildMenuCategoryRevenueIndex(orgId),
    ]);
    if (!item) {
      return next(createHttpError(404, "Menu item not found."));
    }
    res.status(200).json({ success: true, data: menuItemToResponse(item, categoryIndex) });
  } catch (e) {
    next(e);
  }
};

const createMenuItem = async (req, res, next) => {
  try {
    const {
      name,
      description,
      menuNote,
      price,
      priceUsd,
      priceLbp,
      currency,
      category,
      imageUrl,
      isAvailable,
      showOnPOS,
      preparationTime,
      taxCode,
      priceTaxInclusive,
      inventoryImpact,
      standardUnitCost,
      finishedGoodsIngredient,
    } = req.body;

    if (!name || !String(name).trim()) {
      return next(createHttpError(400, "Name is required."));
    }
    if (!category || !mongoose.Types.ObjectId.isValid(category)) {
      return next(createHttpError(400, "Valid category is required."));
    }

    let nextUsd = 0;
    let nextLbp = 0;
    if (priceUsd !== undefined || priceLbp !== undefined) {
      nextUsd = Math.max(0, Number(priceUsd) || 0);
      nextLbp = Math.max(0, Number(priceLbp) || 0);
    } else if (price !== undefined && price !== null && Number(price) >= 0) {
      const cur = String(currency || "USD").toUpperCase();
      const p = Math.max(0, Number(price) || 0);
      if (cur === "LBP") {
        nextLbp = p;
      } else {
        nextUsd = p;
      }
    } else {
      return next(createHttpError(400, "priceUsd/priceLbp (or legacy price) is required."));
    }
    if (nextUsd <= 0 && nextLbp <= 0) {
      return next(
        createHttpError(400, "At least one of priceUsd or priceLbp must be greater than zero.")
      );
    }
    const leg = legacyMirrorFromDual(nextUsd, nextLbp);

    const orgId = assertTenantOrganization(req);
    const cat = await Category.findOne({ _id: category, organization: orgId });
    if (!cat) {
      return next(createHttpError(400, "Category not found."));
    }

    let finishedGoodsIngredientId = undefined;
    if (finishedGoodsIngredient !== undefined) {
      if (finishedGoodsIngredient === null || finishedGoodsIngredient === "") {
        finishedGoodsIngredientId = null;
      } else if (!mongoose.Types.ObjectId.isValid(String(finishedGoodsIngredient))) {
        return next(createHttpError(400, "Invalid finishedGoodsIngredient."));
      } else {
        const ingOk = await Ingredient.exists({
          _id: finishedGoodsIngredient,
          organization: orgId,
        });
        if (!ingOk) {
          return next(
            createHttpError(
              400,
              "finishedGoodsIngredient must reference an ingredient in your organization."
            )
          );
        }
        finishedGoodsIngredientId = finishedGoodsIngredient;
      }
    }

    const doc = await MenuItem.create({
      organization: orgId,
      name: String(name).trim(),
      description:
        description !== undefined ? String(description).trim() : undefined,
      menuNote:
        menuNote !== undefined ? String(menuNote).trim() : undefined,
      price: leg.price,
      currency: leg.currency,
      priceUsd: nextUsd,
      priceLbp: nextLbp,
      category,
      imageUrl:
        imageUrl !== undefined ? String(imageUrl).trim() : undefined,
      isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true,
      showOnPOS: showOnPOS !== undefined ? Boolean(showOnPOS) : true,
      preparationTime:
        preparationTime !== undefined ? Number(preparationTime) || 0 : 0,
      taxCode:
        taxCode !== undefined && taxCode !== ""
          ? String(taxCode).trim()
          : "standard",
      priceTaxInclusive:
        priceTaxInclusive !== undefined ? Boolean(priceTaxInclusive) : false,
      inventoryImpact:
        inventoryImpact !== undefined &&
        MenuItem.INVENTORY_IMPACT &&
        MenuItem.INVENTORY_IMPACT.includes(String(inventoryImpact))
          ? String(inventoryImpact)
          : undefined,
      standardUnitCost:
        standardUnitCost !== undefined && standardUnitCost !== null && standardUnitCost !== ""
          ? Math.max(0, Number(standardUnitCost))
          : undefined,
      ...(finishedGoodsIngredientId !== undefined
        ? { finishedGoodsIngredient: finishedGoodsIngredientId }
        : {}),
    });

    const [populated, categoryIndex] = await Promise.all([
      MenuItem.findById(doc._id).populate(MENU_ITEM_CATEGORY_POPULATE),
      buildMenuCategoryRevenueIndex(orgId),
    ]);

    emitPos(req, "catalog:updated", { scope: "menuItem", id: String(doc._id) });
    res.status(201).json({
      success: true,
      message: "Menu item created.",
      data: menuItemToResponse(populated, categoryIndex),
    });
  } catch (e) {
    next(e);
  }
};

const updateMenuItem = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid menu item id."));
    }

    const item = await MenuItem.findOne({ _id: id, organization: orgId });
    if (!item) {
      return next(createHttpError(404, "Menu item not found."));
    }

    const previousImageUrl = String(item.imageUrl || "").trim();
    const {
      name,
      description,
      menuNote,
      price,
      priceUsd,
      priceLbp,
      currency,
      category,
      imageUrl,
      isAvailable,
      showOnPOS,
      preparationTime,
      taxCode,
      priceTaxInclusive,
      inventoryImpact,
      standardUnitCost,
      finishedGoodsIngredient,
    } = req.body;

    if (category !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return next(createHttpError(400, "Invalid category id."));
      }
      const cat = await Category.findOne({ _id: category, organization: orgId });
      if (!cat) {
        return next(createHttpError(400, "Category not found."));
      }
      item.category = category;
    }

    if (name !== undefined) item.name = String(name).trim();
    if (description !== undefined) item.description = String(description).trim();
    if (menuNote !== undefined) item.menuNote = String(menuNote).trim();

    const touchPrices =
      priceUsd !== undefined ||
      priceLbp !== undefined ||
      price !== undefined;
    if (touchPrices) {
      const curDual = dualPricesFromDoc(item);
      let nextUsd = curDual.priceUsd;
      let nextLbp = curDual.priceLbp;
      if (priceUsd !== undefined) nextUsd = Math.max(0, Number(priceUsd) || 0);
      if (priceLbp !== undefined) nextLbp = Math.max(0, Number(priceLbp) || 0);
      if (price !== undefined && priceUsd === undefined && priceLbp === undefined) {
        const cur = String(currency ?? item.currency ?? "USD").toUpperCase();
        const p = Math.max(0, Number(price) || 0);
        if (cur === "LBP") {
          nextUsd = 0;
          nextLbp = p;
        } else {
          nextUsd = p;
          nextLbp = 0;
        }
      }
      if (nextUsd <= 0 && nextLbp <= 0) {
        return next(
          createHttpError(400, "At least one of priceUsd or priceLbp must be greater than zero.")
        );
      }
      const leg = legacyMirrorFromDual(nextUsd, nextLbp);
      item.priceUsd = nextUsd;
      item.priceLbp = nextLbp;
      item.price = leg.price;
      item.currency = leg.currency;
    }

    if (imageUrl !== undefined) item.imageUrl = String(imageUrl).trim();
    if (isAvailable !== undefined) item.isAvailable = Boolean(isAvailable);
    if (showOnPOS !== undefined) item.showOnPOS = Boolean(showOnPOS);
    if (preparationTime !== undefined) {
      item.preparationTime = Number(preparationTime) || 0;
    }
    if (taxCode !== undefined) {
      item.taxCode = taxCode ? String(taxCode).trim() : "standard";
    }
    if (priceTaxInclusive !== undefined) {
      item.priceTaxInclusive = Boolean(priceTaxInclusive);
    }
    if (
      inventoryImpact !== undefined &&
      MenuItem.INVENTORY_IMPACT &&
      MenuItem.INVENTORY_IMPACT.includes(String(inventoryImpact))
    ) {
      item.inventoryImpact = String(inventoryImpact);
    }
    if (standardUnitCost !== undefined) {
      if (standardUnitCost === null || standardUnitCost === "") {
        item.standardUnitCost = null;
      } else {
        item.standardUnitCost = Math.max(0, Number(standardUnitCost));
      }
    }
    if (finishedGoodsIngredient !== undefined) {
      if (finishedGoodsIngredient === null || finishedGoodsIngredient === "") {
        item.finishedGoodsIngredient = null;
      } else if (!mongoose.Types.ObjectId.isValid(String(finishedGoodsIngredient))) {
        return next(createHttpError(400, "Invalid finishedGoodsIngredient."));
      } else {
        const ingOk = await Ingredient.exists({
          _id: finishedGoodsIngredient,
          organization: orgId,
        });
        if (!ingOk) {
          return next(
            createHttpError(
              400,
              "finishedGoodsIngredient must reference an ingredient in your organization."
            )
          );
        }
        item.finishedGoodsIngredient = finishedGoodsIngredient;
      }
    }

    await item.save();
    const nextImageUrl = String(item.imageUrl || "").trim();
    if (imageUrl !== undefined && previousImageUrl && previousImageUrl !== nextImageUrl) {
      cleanupManagedImage(previousImageUrl);
    }

    const [populated, categoryIndex] = await Promise.all([
      MenuItem.findById(item._id).populate(MENU_ITEM_CATEGORY_POPULATE),
      buildMenuCategoryRevenueIndex(orgId),
    ]);

    emitPos(req, "catalog:updated", { scope: "menuItem", id: String(id) });
    res.status(200).json({
      success: true,
      message: "Menu item updated.",
      data: menuItemToResponse(populated, categoryIndex),
    });
  } catch (e) {
    next(e);
  }
};

const patchAvailability = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid menu item id."));
    }

    const { isAvailable } = req.body;
    if (isAvailable === undefined) {
      return next(createHttpError(400, "isAvailable is required."));
    }

    const [item, categoryIndex] = await Promise.all([
      MenuItem.findOneAndUpdate(
        { _id: id, organization: orgId },
        { isAvailable: Boolean(isAvailable) },
        { new: true }
      ).populate(MENU_ITEM_CATEGORY_POPULATE),
      buildMenuCategoryRevenueIndex(orgId),
    ]);

    if (!item) {
      return next(createHttpError(404, "Menu item not found."));
    }

    emitPos(req, "catalog:updated", { scope: "menuItem", id: String(id) });
    res.status(200).json({
      success: true,
      message: "Availability updated.",
      data: menuItemToResponse(item, categoryIndex),
    });
  } catch (e) {
    next(e);
  }
};

const deleteMenuItem = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid menu item id."));
    }

    const deleted = await MenuItem.findOneAndDelete({ _id: id, organization: orgId });
    if (!deleted) {
      return next(createHttpError(404, "Menu item not found."));
    }
    cleanupManagedImage(deleted.imageUrl);

    emitPos(req, "catalog:updated", { scope: "menuItem", id: String(id) });
    res.status(200).json({ success: true, message: "Menu item deleted." });
  } catch (e) {
    next(e);
  }
};

const attachModifierGroupsToMenuItem = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid menu item id."));
    }
    const modifierGroups = Array.isArray(req.body?.modifierGroups)
      ? req.body.modifierGroups
      : [];
    const groupIds = modifierGroups
      .map((entry) => (entry?.groupId != null ? String(entry.groupId) : ""))
      .filter((groupId) => mongoose.Types.ObjectId.isValid(groupId));
    const distinctIds = [...new Set(groupIds)];
    if (distinctIds.length !== modifierGroups.length) {
      return next(createHttpError(400, "modifierGroups must contain valid unique groupId values."));
    }
    const count = await ModifierGroup.countDocuments({
      _id: { $in: distinctIds },
      organization: orgId,
      location: req.locationScopeId,
    });
    if (count !== distinctIds.length) {
      return next(createHttpError(400, "All modifier groups must exist in the current branch."));
    }
    const updated = await MenuItem.findOneAndUpdate(
      { _id: id, organization: orgId },
      {
        $set: {
          modifierGroups: distinctIds.map((groupId) => ({ groupId })),
        },
      },
      { new: true }
    ).populate(MENU_ITEM_CATEGORY_POPULATE);
    if (!updated) {
      return next(createHttpError(404, "Menu item not found."));
    }
    const categoryIndex = await buildMenuCategoryRevenueIndex(orgId);
    emitPos(req, "catalog:updated", { scope: "menuItem", id: String(id) });
    res.status(200).json({
      success: true,
      message: "Modifier groups attached.",
      data: menuItemToResponse(updated, categoryIndex),
    });
  } catch (error) {
    next(error);
  }
};

const listMenuItemVariants = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { menuItemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(menuItemId)) {
      return next(createHttpError(400, "Invalid menu item id."));
    }
    const ok = await MenuItem.exists({ _id: menuItemId, organization: orgId });
    if (!ok) {
      return next(createHttpError(404, "Menu item not found."));
    }
    const rows = await MenuItemVariant.find({
      organization: orgId,
      menuItem: menuItemId,
    })
      .sort({ variantName: 1 })
      .lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const createMenuItemVariant = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { menuItemId } = req.params;
    const { variantName, attributes, sku, barcode, imageUrl, priceOverride, costOverride, isActive } = req.body;

    if (!variantName || !String(variantName).trim()) {
      return next(createHttpError(400, "Variant name is required."));
    }

    const doc = await MenuItemVariant.create({
      organization: orgId,
      menuItem: menuItemId,
      variantName: String(variantName).trim(),
      attributes: attributes || {},
      sku: sku?.trim() || undefined,
      barcode: barcode?.trim() || undefined,
      imageUrl: imageUrl?.trim() || "",
      priceOverride: priceOverride != null ? Number(priceOverride) : null,
      costOverride: costOverride != null ? Number(costOverride) : null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    emitPos(req, "catalog:updated", { scope: "menuItemVariant", id: String(doc._id) });
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(400, "SKU already exists."));
    }
    next(e);
  }
};

const updateMenuItemVariant = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid variant id."));
    }

    const { variantName, attributes, sku, barcode, imageUrl, priceOverride, costOverride, isActive } = req.body;
    const update = {};
    if (variantName !== undefined) update.variantName = String(variantName).trim();
    if (attributes !== undefined) update.attributes = attributes;
    if (sku !== undefined) update.sku = sku?.trim() || undefined;
    if (barcode !== undefined) update.barcode = barcode?.trim() || undefined;
    if (imageUrl !== undefined) update.imageUrl = imageUrl?.trim() || "";
    if (priceOverride !== undefined) update.priceOverride = priceOverride != null ? Number(priceOverride) : null;
    if (costOverride !== undefined) update.costOverride = costOverride != null ? Number(costOverride) : null;
    if (isActive !== undefined) update.isActive = Boolean(isActive);

    const doc = await MenuItemVariant.findOneAndUpdate(
      { _id: id, organization: orgId },
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!doc) {
      return next(createHttpError(404, "Variant not found."));
    }

    emitPos(req, "catalog:updated", { scope: "menuItemVariant", id: String(doc._id) });
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(400, "SKU already exists."));
    }
    next(e);
  }
};

const deleteMenuItemVariant = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid variant id."));
    }

    const deleted = await MenuItemVariant.findOneAndDelete({ _id: id, organization: orgId });
    if (!deleted) {
      return next(createHttpError(404, "Variant not found."));
    }

    emitPos(req, "catalog:updated", { scope: "menuItemVariant", id: String(id) });
    res.status(200).json({ success: true, message: "Variant deleted." });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listMenuItems,
  listMenuItemVariants,
  createMenuItemVariant,
  updateMenuItemVariant,
  deleteMenuItemVariant,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  patchAvailability,
  deleteMenuItem,
  attachModifierGroupsToMenuItem,
};
