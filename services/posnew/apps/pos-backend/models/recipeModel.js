const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const recipeLineSchema = new mongoose.Schema(
  {
    /** Direct ingredient consumption (flat BoM line). */
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      default: null,
    },
    /**
     * Nested BoM: consume another menu item's recipe, scaled by `quantity`
     * (e.g. 0.5 "sauce batch" per parent serving).
     */
    subMenuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      default: null,
    },
    /** Amount per one parent menu item serving (ingredient units, or sub-recipe scale). */
    quantity: { type: Number, required: true, min: 0 },
    /** If true, line can be omitted for stock checks (POS modifiers — future). */
    optional: { type: Boolean, default: false },
  },
  { _id: false }
);

recipeLineSchema.pre("validate", function validateLine(next) {
  const hasIng = !!this.ingredient;
  const hasSub = !!this.subMenuItem;
  if (hasIng === hasSub) {
    return next(
      new Error("Recipe line must have exactly one of ingredient or subMenuItem")
    );
  }
  next();
});

const recipeSchema = new mongoose.Schema(
  {
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    menuItemVariant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItemVariant",
      default: null,
      index: true,
    },
    ingredients: { type: [recipeLineSchema], default: [] },
  },
  { timestamps: true }
);

recipeSchema.plugin(orgScopePlugin);
recipeSchema.index(
  { organization: 1, menuItem: 1, menuItemVariant: 1 },
  { unique: true, partialFilterExpression: { organization: { $type: "objectId" } } }
);
recipeSchema.index(
  { menuItem: 1, menuItemVariant: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ organization: null }, { organization: { $exists: false } }],
    },
  }
);

module.exports = mongoose.model("Recipe", recipeSchema);
