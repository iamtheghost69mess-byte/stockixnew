const Ingredient = require("../models/ingredientModel");
const { resolveStockableDemand } = require("./inventoryRecipeUtils");

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Recipe-based unit cost for one menu item (POS ingredient costs × BOM qty).
 * @param {string} menuItemId
 * @param {number} lineMultiplier
 * @param {string|null} menuItemVariantId
 * @param {string} organizationId
 * @returns {Promise<number|null>}
 */
async function computeMenuLineUnitCost(
  menuItemId,
  lineMultiplier = 1,
  menuItemVariantId = null,
  organizationId = null
) {
  const mult = Math.max(1, Number(lineMultiplier) || 1);
  let demand;
  try {
    demand = await resolveStockableDemand(menuItemId, mult, menuItemVariantId);
  } catch {
    return null;
  }
  if (!demand.length) return null;

  const ingIds = demand.map((d) => d.ingredientId);
  const filter = { _id: { $in: ingIds } };
  if (organizationId) filter.organization = organizationId;

  const ings = await Ingredient.find(filter)
    .select("averageUnitCost unitCost")
    .lean();
  const costMap = Object.fromEntries(
    ings.map((i) => [
      String(i._id),
      Number(i.averageUnitCost) || Number(i.unitCost) || 0,
    ])
  );

  let total = 0;
  for (const { ingredientId, qty } of demand) {
    total += (costMap[String(ingredientId)] || 0) * Number(qty);
  }
  const perUnit = mult > 0 ? total / mult : total;
  return round2(perUnit);
}

module.exports = {
  computeMenuLineUnitCost,
  round2,
};
