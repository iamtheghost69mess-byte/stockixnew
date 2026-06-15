const mongoose = require("mongoose");

const integrationIngredientMappingSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    posIngredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
    },
    bigcapitalItemId: { type: Number, required: true },
    bigcapitalItemName: { type: String },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

integrationIngredientMappingSchema.index(
  { organization: 1, posIngredientId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "IntegrationIngredientMapping",
  integrationIngredientMappingSchema
);
