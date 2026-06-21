/**
 * Standard COGS from order lines — same rules as GL when defaultCostMethod is "standard".
 * Uses `menuItemVariant.costOverride` per unit when set; otherwise `menuItem.standardUnitCost`.
 *
 * @param {{ items?: ReadonlyArray<{
 *   quantity?: number;
 *   menuItem?: { standardUnitCost?: number } | null;
 *   menuItemVariant?: { costOverride?: number | null } | null;
 * }> } | null | undefined} order
 * @returns {number}
 */
function computeStandardCogsCostFromOrder(order) {
  let total = 0;
  for (const line of order?.items || []) {
    const qty = Number(line.quantity || 1);
    const variant = line.menuItemVariant;
    if (variant && typeof variant === "object") {
      const override = Number(variant.costOverride);
      if (Number.isFinite(override) && override > 0) {
        total += override * qty;
        continue;
      }
    }
    const mi = line.menuItem;
    if (!mi || typeof mi !== "object") continue;
    const u = Number(mi.standardUnitCost);
    if (!Number.isFinite(u) || u <= 0) continue;
    total += u * qty;
  }
  return round2(total);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

module.exports = { computeStandardCogsCostFromOrder, round2 };
