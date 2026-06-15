const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const loyaltyHistorySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, required: true },
    delta: { type: Number, required: true },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const loyaltyAccountSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    points: { type: Number, default: 0, min: 0 },
    history: [loyaltyHistorySchema],
  },
  { timestamps: true }
);

loyaltyAccountSchema.plugin(orgScopePlugin);
loyaltyAccountSchema.index(
  { organization: 1, customer: 1 },
  { unique: true, partialFilterExpression: { organization: { $type: "objectId" } } }
);
loyaltyAccountSchema.index(
  { customer: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ organization: null }, { organization: { $exists: false } }],
    },
  }
);

module.exports = mongoose.model("LoyaltyAccount", loyaltyAccountSchema);
