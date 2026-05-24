const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const menuItemVariantSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
      index: true,
    },
    variantName: { type: String, required: true, trim: true }, // e.g., "Small", "Regular", "Large"
    /** Dynamic attributes for the variant (e.g. { size: 'L', color: 'Red' }) */
    attributes: { type: Map, of: String, default: {} },
    sku: { type: String, trim: true, unique: true, sparse: true }, 
    barcode: { type: String, trim: true, sparse: true },
    imageUrl: { type: String, trim: true, default: "" },
    priceOverride: { type: Number, min: 0, default: null }, 
    costOverride: { type: Number, min: 0, default: null }, 
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

menuItemVariantSchema.plugin(orgScopePlugin);
menuItemVariantSchema.index({ organization: 1, sku: 1 }, { unique: true, sparse: true });
menuItemVariantSchema.index({ organization: 1, barcode: 1 });

module.exports = mongoose.model("MenuItemVariant", menuItemVariantSchema);
