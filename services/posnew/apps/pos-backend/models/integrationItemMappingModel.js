const mongoose = require("mongoose");

const integrationItemMappingSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    posMenuItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    bigcapitalItemId: { type: Number, required: true },
    bigcapitalItemName: { type: String },
    bigcapitalCostPrice: { type: Number },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

integrationItemMappingSchema.index(
  { organization: 1, posMenuItemId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "IntegrationItemMapping",
  integrationItemMappingSchema
);
