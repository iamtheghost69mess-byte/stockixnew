const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const SOURCES = ["receive", "manual", "purchase_order", "adjustment"];

const ingredientPriceHistorySchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    /** Unit cost in stock UoM at this event */
    unitPrice: { type: Number, required: true, min: 0 },
    source: {
      type: String,
      enum: SOURCES,
      default: "receive",
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

ingredientPriceHistorySchema.plugin(orgScopePlugin);
ingredientPriceHistorySchema.index({ organization: 1, ingredient: 1, createdAt: -1 });
ingredientPriceHistorySchema.index({ ingredient: 1, createdAt: -1 });

module.exports = mongoose.model(
  "IngredientPriceHistory",
  ingredientPriceHistorySchema
);
module.exports.SOURCES = SOURCES;
