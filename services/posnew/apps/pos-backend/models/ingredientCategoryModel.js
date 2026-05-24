const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const ingredientCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    /** Reference to a parent category (for hierarchical roll-ups) */
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IngredientCategory",
      default: null,
      index: true,
    },
    /** Category-level default tax code for ingredients */
    taxCode: { type: String, trim: true, default: null },
    imageUrl: { type: String, trim: true, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ingredientCategorySchema.plugin(orgScopePlugin);
ingredientCategorySchema.index(
  { organization: 1, name: 1 },
  { unique: true, partialFilterExpression: { organization: { $type: "objectId" } } }
);
ingredientCategorySchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ organization: null }, { organization: { $exists: false } }],
    },
  }
);
ingredientCategorySchema.index({ organization: 1, sortOrder: 1, name: 1 });
ingredientCategorySchema.index({ sortOrder: 1, name: 1 });

module.exports = mongoose.model("IngredientCategory", ingredientCategorySchema);
