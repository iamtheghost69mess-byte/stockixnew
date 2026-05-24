const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Recipe = require("../models/recipeModel");
const MenuItem = require("../models/menuItemModel");
const MenuItemVariant = require("../models/menuItemVariantModel");
const Ingredient = require("../models/ingredientModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const { assertTenantOrganization } = require("../utils/tenantOrg");

/** Base recipe (no variant) vs variant-scoped BOM. */
function recipeScopeFilter(orgId, menuItemId, variantIdRaw) {
  const base = { organization: orgId, menuItem: menuItemId };
  const v = variantIdRaw != null ? String(variantIdRaw).trim() : "";
  if (v && mongoose.Types.ObjectId.isValid(v)) {
    return { ...base, menuItemVariant: new mongoose.Types.ObjectId(v) };
  }
  return {
    ...base,
    $or: [{ menuItemVariant: null }, { menuItemVariant: { $exists: false } }],
  };
}

const listRecipes = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const filter = { organization: orgId };
    const pag = parsePaginationQuery(req.query);
    const base = Recipe.find(filter)
      .populate("menuItem", "name price category")
      .populate("menuItemVariant", "variantName sku")
      .populate(
        "ingredients.ingredient",
        "name unit currentStock reorderThreshold"
      )
      .populate("ingredients.subMenuItem", "name price inventoryImpact")
      .sort({ updatedAt: -1 });

    if (pag.active) {
      const [recipes, total] = await Promise.all([
        base.clone().skip(pag.skip).limit(pag.limit),
        Recipe.countDocuments(filter),
      ]);
      return res.status(200).json({
        success: true,
        data: recipes,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }

    const recipes = await base;
    res.status(200).json({ success: true, data: recipes });
  } catch (e) {
    next(e);
  }
};

const getRecipeByMenuItem = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { menuItemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(menuItemId)) {
      return next(createHttpError(400, "Invalid menu item id."));
    }
    const variantId = req.query.variantId;
    const filter = recipeScopeFilter(orgId, menuItemId, variantId);
    const recipe = await Recipe.findOne(filter)
      .populate("menuItem", "name price category")
      .populate("menuItemVariant", "variantName sku priceOverride")
      .populate("ingredients.ingredient", "name unit currentStock")
      .populate("ingredients.subMenuItem", "name price inventoryImpact");
    res.status(200).json({ success: true, data: recipe });
  } catch (e) {
    next(e);
  }
};

const upsertRecipe = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { menuItem, menuItemVariant, ingredients } = req.body;
    if (!menuItem || !mongoose.Types.ObjectId.isValid(menuItem)) {
      return next(createHttpError(400, "Valid menuItem is required."));
    }
    const exists = await MenuItem.findOne({
      _id: menuItem,
      organization: orgId,
    });
    if (!exists) {
      return next(createHttpError(404, "Menu item not found."));
    }

    let variantObjectId = null;
    if (menuItemVariant != null && String(menuItemVariant).trim() !== "") {
      if (!mongoose.Types.ObjectId.isValid(String(menuItemVariant))) {
        return next(createHttpError(400, "Invalid menuItemVariant."));
      }
      const v = await MenuItemVariant.findOne({
        _id: menuItemVariant,
        organization: orgId,
        menuItem,
      }).select("_id");
      if (!v) {
        return next(
          createHttpError(400, "menuItemVariant not found for this menu item."),
        );
      }
      variantObjectId = String(menuItemVariant);
    }

    const lines = [];
    if (Array.isArray(ingredients)) {
      for (const row of ingredients) {
        const qty = Number(row.quantity);
        if (Number.isNaN(qty) || qty < 0) {
          return next(createHttpError(400, "Each line needs a non-negative quantity."));
        }
        const hasIng =
          row.ingredient && mongoose.Types.ObjectId.isValid(row.ingredient);
        const hasSub =
          row.subMenuItem && mongoose.Types.ObjectId.isValid(row.subMenuItem);
        if (hasIng === hasSub) {
          return next(
            createHttpError(
              400,
              "Each line needs exactly one of ingredient or subMenuItem."
            )
          );
        }
        if (hasSub) {
          const sub = await MenuItem.findOne({
            _id: row.subMenuItem,
            organization: orgId,
          }).select("_id");
          if (!sub) {
            return next(createHttpError(400, "subMenuItem not found."));
          }
          lines.push({
            subMenuItem: row.subMenuItem,
            quantity: qty,
            optional: !!row.optional,
          });
        } else {
          const ingRow = await Ingredient.findOne({
            _id: row.ingredient,
            organization: orgId,
          }).select("_id");
          if (!ingRow) {
            return next(createHttpError(400, "Ingredient not found."));
          }
          lines.push({
            ingredient: row.ingredient,
            quantity: qty,
            optional: !!row.optional,
          });
        }
      }
    }

    const filter = recipeScopeFilter(orgId, menuItem, variantObjectId);
    let recipe = await Recipe.findOne(filter);
    if (!recipe) {
      recipe = new Recipe({
        organization: orgId,
        menuItem,
        menuItemVariant: variantObjectId || null,
        ingredients: lines,
      });
    } else {
      recipe.ingredients = lines;
      recipe.menuItemVariant = variantObjectId || null;
    }
    await recipe.save();
    const populated = await Recipe.findById(recipe._id)
      .populate("menuItem", "name price category")
      .populate("menuItemVariant", "variantName sku priceOverride")
      .populate("ingredients.ingredient", "name unit currentStock")
      .populate("ingredients.subMenuItem", "name price inventoryImpact");

    res.status(200).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

const deleteRecipe = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { menuItemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(menuItemId)) {
      return next(createHttpError(400, "Invalid menu item id."));
    }
    const variantId = req.query.variantId;
    const filter = recipeScopeFilter(orgId, menuItemId, variantId);
    const doc = await Recipe.findOneAndDelete(filter);
    if (!doc) {
      return next(createHttpError(404, "Recipe not found."));
    }
    res.status(200).json({ success: true, message: "Recipe removed." });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listRecipes,
  getRecipeByMenuItem,
  upsertRecipe,
  deleteRecipe,
};
