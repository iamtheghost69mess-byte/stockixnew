const mongoose = require("mongoose");

/**
 * Org-level named discount presets (percentage or fixed). Live checks use `Order` line discounts,
 * `manualDiscountAmount`, and `DiscountAudit` rows; this model is the catalog anchor for future
 * “apply saved discount” flows in back office and POS.
 */
const discountCatalogSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    code: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },
    value: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

discountCatalogSchema.index({ organization: 1, name: 1 }, { unique: true });

module.exports =
  mongoose.models.DiscountCatalog ||
  mongoose.model("DiscountCatalog", discountCatalogSchema);
