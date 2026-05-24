const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

/**
 * On-hand (and planning) quantities per location × ingredient.
 * `quantity` is in the ingredient's stock unit (same as recipes / movements).
 */
const stockBalanceSchema = new mongoose.Schema(
  {
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true, default: 0, min: 0 },
    /** Reserved for open checks (manual / future auto). */
    reservedQty: { type: Number, default: 0, min: 0 },
    /** Expected from POs / deliveries not yet received (planning). */
    incomingQty: { type: Number, default: 0, min: 0 },
    maxStockLevel: { type: Number, default: 0, min: 0 },
    /** Precise storage bin linkage. */
    bin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bin",
      default: null,
      index: true,
    },
    /** Timestamp of last physical verification (stock take) */
    lastInventoriedAt: { type: Date, default: null },
    /** Timestamp of last movement impacting this balance (aging) */
    lastMovedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

stockBalanceSchema.plugin(orgScopePlugin);
stockBalanceSchema.index(
  { organization: 1, location: 1, ingredient: 1, bin: 1 },
  { unique: true, partialFilterExpression: { organization: { $type: "objectId" } } }
);
stockBalanceSchema.index(
  { location: 1, ingredient: 1, bin: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ organization: null }, { organization: { $exists: false } }],
    },
  }
);

module.exports = mongoose.model("StockBalance", stockBalanceSchema);
