const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const loyaltyConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default" },
    pointsPerRupee: { type: Number, default: 1, min: 0 },
    pointsPerRupeeOff: { type: Number, default: 10, min: 1 },
    minRedeemPoints: { type: Number, default: 10, min: 0 },
  },
  { timestamps: true }
);

loyaltyConfigSchema.plugin(orgScopePlugin);
loyaltyConfigSchema.index(
  { organization: 1, key: 1 },
  { unique: true, partialFilterExpression: { organization: { $type: "objectId" } } }
);
loyaltyConfigSchema.index(
  { key: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ organization: null }, { organization: { $exists: false } }],
    },
  }
);

module.exports = mongoose.model("LoyaltyConfig", loyaltyConfigSchema);
