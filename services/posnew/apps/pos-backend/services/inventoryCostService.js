const Ingredient = require("../models/ingredientModel");
const InventoryCostLayer = require("../models/inventoryCostLayerModel");
const AccountingConfig = require("../models/accountingConfigModel");

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function getCostMethod() {
  const cfg = await AccountingConfig.findOne({ key: "default" }).lean();
  const m = String(cfg?.defaultCostMethod || "fifo").toLowerCase();
  if (m === "weighted_average") return "weighted_average";
  if (m === "standard") return "standard";
  if (m === "lifo") return "lifo";
  if (m === "fefo") return "fefo";
  return "fifo";
}

/**
 * @param {import("mongoose").ClientSession|null} [session]
 */
async function consumeIngredientCost(
  ingredientId,
  qty,
  session = null,
  lotSlices = null
) {
  const q = round2(qty);
  if (q <= 0) return { totalCost: 0 };
  const method = await getCostMethod();
  const ingQ = Ingredient.findById(ingredientId);
  if (session) ingQ.session(session);
  const ing = await ingQ;
  if (!ing) return { totalCost: 0 };

  if (method === "weighted_average" || method === "standard") {
    const avg =
      method === "standard"
        ? Number(ing.unitCost) || 0
        : Number(ing.averageUnitCost) > 0
          ? Number(ing.averageUnitCost)
          : Number(ing.unitCost) || 0;
    return { totalCost: round2(avg * q) };
  }

  if (method === "fefo" || method === "fifo") {
    if (Array.isArray(lotSlices) && lotSlices.length > 0) {
      const totalCost = lotSlices.reduce((sum, slice) => {
        const sq = Number(slice.qty) || 0;
        const uc = Number(slice.unitCost) || 0;
        return round2(sum + round2(sq * uc));
      }, 0);
      return { totalCost };
    }
  }

  let need = q;
  let totalCost = 0;
  const layerSort =
    method === "lifo" ? { receivedAt: -1, _id: -1 } : { receivedAt: 1, _id: 1 };
  const layerQ = InventoryCostLayer.find({
    ingredient: ingredientId,
    quantityRemaining: { $gt: 0 },
  }).sort(layerSort);
  if (session) layerQ.session(session);
  const layers = await layerQ;

  for (const layer of layers) {
    if (need <= 0) break;
    const take = Math.min(need, layer.quantityRemaining);
    const part = round2(take * layer.unitCost);
    totalCost = round2(totalCost + part);
    layer.quantityRemaining = round2(layer.quantityRemaining - take);
    await layer.save(session ? { session } : {});
    need = round2(need - take);
  }

  if (need > 0.0001) {
    const fallback = Number(ing.unitCost) || 0;
    totalCost = round2(totalCost + round2(need * fallback));
  }

  return { totalCost };
}

async function restoreIngredientCost(ingredientId, restoredQty, costAmount) {
  const q = round2(restoredQty);
  if (q <= 0) return;
  const method = await getCostMethod();
  const ing = await Ingredient.findById(ingredientId);
  if (!ing) return;

  const cost = round2(Number(costAmount) || 0);
  const unitCost = q > 0 ? round2(cost / q) : 0;

  if (method === "weighted_average" || method === "standard") {
    const newS = Number(ing.currentStock) || 0;
    const prevStock = round2(newS - q);
    const oldAvg =
      method === "standard"
        ? Number(ing.unitCost) || 0
        : Number(ing.averageUnitCost) > 0
          ? Number(ing.averageUnitCost)
          : Number(ing.unitCost) || 0;
    if (newS > 0 && method === "weighted_average") {
      ing.averageUnitCost = round2((prevStock * oldAvg + cost) / newS);
      await ing.save();
    }
    return { totalCost: cost, unitCost };
  }

  await InventoryCostLayer.create({
    ingredient: ingredientId,
    quantityRemaining: q,
    unitCost: unitCost || Number(ing.unitCost) || 0,
    source: "restoration",
    note: "Stock restoration",
  });

  return { totalCost: cost, unitCost: unitCost || Number(ing.unitCost) || 0 };
}

/**
 * @param {import("mongoose").ClientSession|null} [session]
 */
async function addReceiveCost(ingredientId, qtyDelta, unitCost, session = null) {
  const delta = round2(qtyDelta);
  if (delta <= 0) return;
  const uc = round2(Number(unitCost) || 0);
  const method = await getCostMethod();
  const ingQ = Ingredient.findById(ingredientId);
  if (session) ingQ.session(session);
  const ing = await ingQ;
  if (!ing) return;

  const saveOpts = session ? { session } : {};

  if (method === "weighted_average") {
    const newS = Number(ing.currentStock) || 0;
    const oldS = round2(newS - delta);
    const oldAvg =
      Number(ing.averageUnitCost) > 0
        ? Number(ing.averageUnitCost)
        : Number(ing.unitCost) || 0;
    if (newS > 0) {
      ing.averageUnitCost = round2((oldS * oldAvg + delta * uc) / newS);
      await ing.save(saveOpts);
    }
    return { totalCost: round2(delta * uc), unitCost: uc };
  }

  if (method === "standard") {
    return { totalCost: round2(delta * uc), unitCost: uc };
  }

  /** FIFO and LIFO both use cost layers; receive ordering is chronological; issue order differs only on consume. */
  await InventoryCostLayer.create(
    [
      {
        ingredient: ingredientId,
        quantityRemaining: delta,
        unitCost: uc,
        source: "receive",
      },
    ],
    session ? { session } : {}
  );

  return { totalCost: round2(delta * uc), unitCost: uc };
}

async function bootstrapLayersFromStock() {
  const method = await getCostMethod();
  const ings = await Ingredient.find({
    currentStock: { $gt: 0 },
    unitCost: { $gt: 0 },
  });
  const out = [];
  for (const ing of ings) {
    if (method === "fifo" || method === "lifo") {
      const existing = await InventoryCostLayer.countDocuments({
        ingredient: ing._id,
      });
      if (existing > 0) continue;
      await InventoryCostLayer.create({
        ingredient: ing._id,
        quantityRemaining: round2(ing.currentStock),
        unitCost: round2(ing.unitCost),
        source: "bootstrap",
        note: "Opening layer from current stock",
      });
      out.push(String(ing._id));
    } else {
      ing.averageUnitCost = round2(ing.unitCost);
      await ing.save();
      out.push(String(ing._id));
    }
  }
  return { ingredientIds: out, method };
}

module.exports = {
  round2,
  getCostMethod,
  consumeIngredientCost,
  restoreIngredientCost,
  addReceiveCost,
  bootstrapLayersFromStock,
};
