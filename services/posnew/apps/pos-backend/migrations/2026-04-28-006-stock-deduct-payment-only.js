/**
 * Align persisted accounting config with POS policy: recipe stock deducts only when orders are paid.
 */
module.exports = {
  migrationId: "2026-04-28-006-stock-deduct-payment-only",
  description: "Set AccountingConfig.stockDeductTrigger to payment for all legacy kitchen_send/both rows.",
  async run() {
    const AccountingConfig = require("../models/accountingConfigModel");
    const res = await AccountingConfig.updateMany(
      { stockDeductTrigger: { $in: ["kitchen_send", "both"] } },
      { $set: { stockDeductTrigger: "payment" } },
    );
    return { modifiedCount: res.modifiedCount ?? 0, matchedCount: res.matchedCount ?? 0 };
  },
};
