const mongoose = require("mongoose");

const COMBO_TYPES = ["fixed", "choice"];

const comboSlotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    required: { type: Boolean, default: true },
    items: {
      type: [
        {
          menuItemId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuItem",
            required: true,
          },
        },
      ],
      default: [],
    },
  },
  { _id: false }
);

const comboSchema = new mongoose.Schema(
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
    description: { type: String, trim: true, default: "" },
    price: { type: Number, required: true, min: 0 },
    type: { type: String, enum: COMBO_TYPES, required: true },
    slots: { type: [comboSlotSchema], default: [] },
    image: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

comboSchema.index({ organization: 1, location: 1, name: 1 });

module.exports = mongoose.model("Combo", comboSchema);
module.exports.COMBO_TYPES = COMBO_TYPES;

