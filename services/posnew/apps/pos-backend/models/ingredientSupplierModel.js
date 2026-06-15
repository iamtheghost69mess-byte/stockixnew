const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

/**
 * Many-to-many pricing: one ingredient can have multiple suppliers.
 */
const ingredientSupplierSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    /** Price per purchase unit at this supplier (same currency as POS). */
    unitPrice: { type: Number, default: 0, min: 0 },
    minimumOrderQty: { type: Number, default: 0, min: 0 },
    leadTimeDays: { type: Number, default: 0, min: 0 },
    isPreferred: { type: Boolean, default: false },
    supplierSku: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

ingredientSupplierSchema.plugin(orgScopePlugin);
ingredientSupplierSchema.index(
  { organization: 1, ingredient: 1, supplier: 1 },
  { unique: true, partialFilterExpression: { organization: { $type: "objectId" } } }
);
ingredientSupplierSchema.index(
  { ingredient: 1, supplier: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ organization: null }, { organization: { $exists: false } }],
    },
  }
);

module.exports = mongoose.model("IngredientSupplier", ingredientSupplierSchema);
