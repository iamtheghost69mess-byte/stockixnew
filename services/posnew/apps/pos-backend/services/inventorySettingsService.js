const AccountingConfig = require("../models/accountingConfigModel");

/**
 * Reads inventory-related flags from the tenant accounting config document.
 * @param {import("mongoose").Types.ObjectId | string | null | undefined} organizationId
 */
async function getInventorySettings(organizationId) {
  const q = organizationId
    ? { organization: organizationId }
    : { organization: { $ne: null } };
  const cfg = await AccountingConfig.findOne(q)
    .sort({ _id: 1 })
    .select(
      "stockDeductTrigger strictOversell reserveStockOnPending"
    )
    .lean();
  /**
   * POS inventory consumption is standardized on **payment** (paid checks) only.
   * Legacy `kitchen_send` / `both` values in AccountingConfig are ignored at runtime so stock
   * never leaves on abandoned tickets.
   */
  const stockDeductTrigger = "payment";
  return {
    stockDeductTrigger,
    strictOversell: !!cfg?.strictOversell,
    reserveStockOnPending: cfg?.reserveStockOnPending !== false,
  };
}

function shouldDeductOnKitchenSend(settings) {
  return (
    settings.stockDeductTrigger === "kitchen_send" ||
    settings.stockDeductTrigger === "both"
  );
}

function shouldDeductOnPayment(settings) {
  return (
    settings.stockDeductTrigger === "payment" ||
    settings.stockDeductTrigger === "both"
  );
}

module.exports = {
  getInventorySettings,
  shouldDeductOnKitchenSend,
  shouldDeductOnPayment,
};
