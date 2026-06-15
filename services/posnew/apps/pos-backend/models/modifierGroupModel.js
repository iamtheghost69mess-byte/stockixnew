const mongoose = require("mongoose");

const MODIFIER_GROUP_TYPES = ["variant", "addon"];

const modifierOptionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    priceAdjustment: { type: Number, default: 0 },
  },
  { _id: false }
);

const modifierGroupSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: MODIFIER_GROUP_TYPES,
      required: true,
    },
    required: { type: Boolean, default: false },
    minSelections: { type: Number, default: 1, min: 0 },
    maxSelections: { type: Number, default: 1, min: 1 },
    options: { type: [modifierOptionSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

modifierGroupSchema.index({ organization: 1, location: 1, name: 1 });

module.exports = mongoose.model("ModifierGroup", modifierGroupSchema);
module.exports.MODIFIER_GROUP_TYPES = MODIFIER_GROUP_TYPES;

