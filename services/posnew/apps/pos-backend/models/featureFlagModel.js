const mongoose = require("mongoose");

const orgOverrideSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    enabled: { type: Boolean, required: true },
  },
  { _id: false }
);

const featureFlagSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true, unique: true },
    description: { type: String, trim: true, default: "" },
    defaultEnabled: { type: Boolean, default: false },
    rolloutPercent: { type: Number, default: 0, min: 0, max: 100 },
    killSwitch: { type: Boolean, default: false },
    orgOverrides: { type: [orgOverrideSchema], default: () => [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FeatureFlag", featureFlagSchema);
