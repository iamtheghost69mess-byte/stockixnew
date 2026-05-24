const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const WASTAGE_REASONS = ["spoilage", "accident", "staff_meal", "other"];

const wastageEntrySchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, trim: true, default: "" },
    reason: {
      type: String,
      enum: WASTAGE_REASONS,
      required: true,
      index: true,
    },
    notes: { type: String, trim: true, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    unitCostAtEntry: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

wastageEntrySchema.plugin(orgScopePlugin);
wastageEntrySchema.index({ organization: 1, location: 1, createdAt: -1 });
wastageEntrySchema.index({ organization: 1, reason: 1, createdAt: -1 });

const WastageEntry = mongoose.model("WastageEntry", wastageEntrySchema);

module.exports = WastageEntry;
module.exports.WASTAGE_REASONS = WASTAGE_REASONS;
