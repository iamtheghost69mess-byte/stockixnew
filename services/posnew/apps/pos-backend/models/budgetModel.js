const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const budgetSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      required: true,
      index: true,
    },
    fiscalYear: { type: Number, required: true },
    periodMonth: { type: Number, required: true, min: 1, max: 12 },
    budgetedAmount: { type: Number, required: true, default: 0 },
    /** Type of budget for reporting classification */
    budgetType: {
      type: String,
      enum: ["revenue", "expense", "capital", "cash"],
      default: "expense",
      index: true,
    },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

budgetSchema.plugin(orgScopePlugin);
budgetSchema.index({ organization: 1, fiscalYear: 1, periodMonth: 1, accountId: 1 }, { unique: true });

module.exports = mongoose.model("Budget", budgetSchema);
