const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

/**
 * Guest / QR menu presentation — scoped by organization + scopeKey.
 */
const publicMenuBrandingSchema = new mongoose.Schema(
  {
    scopeKey: { type: String, required: true, trim: true },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    displayName: { type: String, trim: true, default: "" },
    tagline: { type: String, trim: true, default: "" },
    logoUrl: { type: String, trim: true, default: "" },
    accentColor: { type: String, trim: true, default: "#ca8a04" },
    showPrices: { type: Boolean, default: true },
    receiptHeaderText: { type: String, trim: true, default: "" },
    receiptFooterText: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

publicMenuBrandingSchema.plugin(orgScopePlugin);
publicMenuBrandingSchema.index(
  { organization: 1, scopeKey: 1 },
  { unique: true, partialFilterExpression: { organization: { $type: "objectId" } } }
);
publicMenuBrandingSchema.index(
  { scopeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ organization: null }, { organization: { $exists: false } }],
    },
  }
);

module.exports = mongoose.model("PublicMenuBranding", publicMenuBrandingSchema);
