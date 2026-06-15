const mongoose = require("mongoose");

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"];

const accountingAccountSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    /** Optional branch scoping for branch-specific chart rows. */
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ACCOUNT_TYPES,
      required: true,
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

accountingAccountSchema.index({ type: 1, sortOrder: 1 });
accountingAccountSchema.index(
  { organization: 1, location: 1, code: 1 },
  {
    unique: true,
    partialFilterExpression: { organization: { $type: "objectId" } },
  }
);

module.exports = mongoose.model("AccountingAccount", accountingAccountSchema);
module.exports.ACCOUNT_TYPES = ACCOUNT_TYPES;
