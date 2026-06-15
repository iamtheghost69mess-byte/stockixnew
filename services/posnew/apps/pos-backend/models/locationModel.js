const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true, default: "" },
    address: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    timezone: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    taxVatNumber: { type: String, trim: true, default: "" },
    /** Type of location for inventory flow */
    locationType: {
      type: String,
      enum: ["storefront", "warehouse", "virtual", "kitchen"],
      default: "storefront",
      index: true,
    },
    /** Optional default zone for automated routing */
    defaultZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Zone",
      default: null,
    },
    /** Branch-level override: waiters may print receipts when true. */
    waiterCanPrintReceipt: {
      type: Boolean,
      default: false,
    },
    kitchenWorkflowEnabled: {
      type: Boolean,
      default: true,
    },
    vatRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    vatInclusive: {
      type: Boolean,
      default: false,
    },
    /**
     * When true (default), manual discounts on checks at this branch require a reason.
     * Falls back to AccountingConfig.discountReasonRequired when unset for legacy rows.
     */
    discountReasonRequired: {
      type: Boolean,
      default: true,
    },
    receiptLogo: { type: String, trim: true, default: "" },
    receiptHeader: { type: String, trim: true, default: "" },
    receiptFooter: { type: String, trim: true, default: "" },
    receiptShowVAT: { type: Boolean, default: true },
    receiptShowServiceCharge: { type: Boolean, default: true },
    receiptConfig: {
      headerLine1: { type: String, trim: true, default: "" },
      headerLine2: { type: String, trim: true, default: "" },
      footerLine: { type: String, trim: true, default: "Thank you" },
      showBranchName: { type: Boolean, default: true },
      showBranchAddress: { type: Boolean, default: true },
      showBranchPhone: { type: Boolean, default: false },
      showTaxVatNumber: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

locationSchema.index({ organization: 1, name: 1 });
locationSchema.index({ organization: 1, code: 1 });
locationSchema.index({ name: 1 });
locationSchema.index({ code: 1 });

module.exports = mongoose.model("Location", locationSchema);
