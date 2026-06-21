const mongoose = require("mongoose");

const LAYER_SOURCES = ["receive", "bootstrap", "restoration", "opening"];

const inventoryCostLayerSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    quantityRemaining: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    receivedAt: { type: Date, default: Date.now, index: true },
    source: {
      type: String,
      enum: LAYER_SOURCES,
      default: "receive",
    },
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

inventoryCostLayerSchema.index({ ingredient: 1, receivedAt: 1 });

module.exports = mongoose.model("InventoryCostLayer", inventoryCostLayerSchema);
module.exports.LAYER_SOURCES = LAYER_SOURCES;
