const Recipe = require("../models/recipeModel");
const MenuItem = require("../models/menuItemModel");

const MAX_BOM_DEPTH = 12;

/**
 * @param {import('mongoose').Types.ObjectId|string} menuItemId
 * @param {number} lineMultiplier — typically order line quantity
 * @param {Set<string>} pathStack — current recursion path (detect cycles)
 * @param {number} depth
 * @returns {Promise<Array<{ ingredientId: string, qty: number }>>}
 */
async function flattenRecipeDemand(
  menuItemId,
  lineMultiplier,
  menuItemVariantId = null,
  pathStack = new Set(),
  depth = 0
) {
  const mid = String(menuItemId);
  if (pathStack.has(mid)) {
    const err = new Error(`Circular recipe reference: menu item ${mid}`);
    err.code = "CIRCULAR_RECIPE";
    throw err;
  }
  if (depth > MAX_BOM_DEPTH) {
    const err = new Error("Recipe nesting exceeds maximum depth");
    err.code = "BOM_DEPTH";
    throw err;
  }

  pathStack.add(mid);
  const recipe = await Recipe.findOne({
    menuItem: menuItemId,
    menuItemVariant: menuItemVariantId || null,
  }).lean();
  const agg = new Map();

  if (recipe?.ingredients?.length) {
    for (const row of recipe.ingredients) {
      if (row.optional) continue;
      const q = (Number(row.quantity) || 0) * lineMultiplier;
      if (q <= 0) continue;

      if (row.subMenuItem) {
        const subRows = await flattenRecipeDemand(
          row.subMenuItem,
          q,
          null,
          pathStack,
          depth + 1
        );
        for (const { ingredientId, qty } of subRows) {
          agg.set(ingredientId, (agg.get(ingredientId) || 0) + qty);
        }
      } else if (row.ingredient) {
        const id = String(row.ingredient);
        agg.set(id, (agg.get(id) || 0) + q);
      }
    }
  }

  pathStack.delete(mid);
  return [...agg.entries()].map(([ingredientId, qty]) => ({ ingredientId, qty }));
}

/**
 * Stockable demand: optional single-ingredient “finished good” override, else recipe BOM.
 * @param {import("mongoose").Types.ObjectId|string} menuItemId
 * @param {number} lineMultiplier
 * @param {import("mongoose").Types.ObjectId|string|null} [menuItemVariantId]
 * @returns {Promise<Array<{ ingredientId: string, qty: number }>>}
 */
async function resolveStockableDemand(
  menuItemId,
  lineMultiplier,
  menuItemVariantId = null
) {
  const mi = await MenuItem.findById(menuItemId)
    .select("inventoryImpact finishedGoodsIngredient")
    .lean();
  if (!mi || mi.inventoryImpact !== "stockable") {
    return [];
  }
  if (mi.finishedGoodsIngredient) {
    const mult = Math.max(1, Number(lineMultiplier) || 1);
    return [{ ingredientId: String(mi.finishedGoodsIngredient), qty: mult }];
  }
  return flattenRecipeDemand(menuItemId, lineMultiplier, menuItemVariantId);
}

module.exports = {
  flattenRecipeDemand,
  resolveStockableDemand,
  MAX_BOM_DEPTH,
};
