const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

/**
 * Per-organization tax config: key "default" holds VAT/sales tax rate as a decimal.
 */
const taxConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", trim: true },
    rate: {
      type: Number,
      default: 0.0525,
      min: 0,
      max: 1,
    },
  },
  { timestamps: true }
);

taxConfigSchema.plugin(orgScopePlugin);
taxConfigSchema.index(
  { organization: 1, key: 1 },
  { unique: true, partialFilterExpression: { organization: { $type: "objectId" } } }
);
taxConfigSchema.index(
  { key: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ organization: null }, { organization: { $exists: false } }],
    },
  }
);

module.exports = mongoose.model("TaxConfig", taxConfigSchema);
