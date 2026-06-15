const mongoose = require("mongoose");
const StockMovement = require("../models/stockMovementModel");
const Ingredient = require("../models/ingredientModel");
const StockBalance = require("../models/stockBalanceModel");

async function calculateForecast(organizationId, ingredientId = null) {
  const q = { organization: organizationId };
  if (ingredientId) q._id = ingredientId;

  const ingredients = await Ingredient.find(q).lean();
  const results = [];

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const ing of ingredients) {
    // 1. Get 30-day consumption movements
    const moves = await StockMovement.find({
      organization: organizationId,
      ingredient: ing._id,
      reason: { $in: ["order_deduction", "consume"] },
      createdAt: { $gte: thirtyDaysAgo }
    }).lean();

    const total30d = moves.reduce((sum, m) => sum + Math.abs(m.delta), 0);
    const avg30d = total30d / 30;

    const total7d = moves
      .filter(m => m.createdAt >= sevenDaysAgo)
      .reduce((sum, m) => sum + Math.abs(m.delta), 0);
    const avg7d = total7d / 7;

    // Use higher average for conservative "days to zero"
    const currentRate = Math.max(avg7d, avg30d);
    
    const balances = await StockBalance.find({ ingredient: ing._id }).lean();
    const currentStock = balances.reduce((s, b) => s + (b.quantity || 0), 0);

    let daysToZero = Infinity;
    if (currentRate > 0) {
      daysToZero = currentStock / currentRate;
    }

    results.push({
      ingredient: { _id: ing._id, name: ing.name, unit: ing.unit },
      currentStock,
      avgConsumption7d: Math.round(avg7d * 100) / 100,
      avgConsumption30d: Math.round(avg30d * 100) / 100,
      currentRate: Math.round(currentRate * 100) / 100,
      daysToZero: daysToZero === Infinity ? null : Math.round(daysToZero * 10) / 10,
      projectedStockOutDate: daysToZero === Infinity ? null : new Date(now.getTime() + daysToZero * 24 * 60 * 60 * 1000),
      reorderAlert: daysToZero <= (ing.leadTimeDays || 3) // Default 3 days lead time
    });
  }

  return results.sort((a, b) => (a.daysToZero === null ? 1 : b.daysToZero === null ? -1 : a.daysToZero - b.daysToZero));
}

module.exports = {
  calculateForecast,
};
