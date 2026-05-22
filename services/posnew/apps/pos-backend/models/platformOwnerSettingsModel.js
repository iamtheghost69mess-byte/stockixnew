const mongoose = require("mongoose");

const defaultTaxRateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, default: "", trim: true },
    /** Percent, e.g. 8.25 for 8.25% */
    ratePercent: { type: Number, default: 0 },
    kind: {
      type: String,
      enum: ["sales", "withholding"],
      default: "sales",
    },
  },
  { _id: false }
);

const accountingDefaultsSchema = new mongoose.Schema(
  {
    companyCurrency: { type: String, default: "USD", trim: true, uppercase: true },
    defaultCostMethod: {
      type: String,
      enum: ["fifo", "lifo", "weighted_average", "standard"],
      default: "fifo",
    },
    fiscalYearStartMonth: { type: Number, min: 1, max: 12, default: 1 },
    stockDeductTrigger: {
      type: String,
      enum: ["kitchen_send", "payment", "both"],
      default: "payment",
    },
  },
  { _id: false }
);

const platformOwnerSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "singleton", unique: true, immutable: true },
    /** ISO 4217 codes enabled for new org onboarding / documentation */
    supportedCurrencies: { type: [String], default: () => ["USD", "EUR", "GBP"] },
    defaultCurrency: { type: String, default: "USD", trim: true, uppercase: true },
    /** Template defaults (no GL account linkage at platform layer) */
    defaultTaxRates: { type: [defaultTaxRateSchema], default: () => [] },
    accountingDefaults: { type: accountingDefaultsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformOwnerSettings", platformOwnerSettingsSchema);
