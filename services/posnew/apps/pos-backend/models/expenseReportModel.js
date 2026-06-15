const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const EXPENSE_STATUSES = ["draft", "submitted", "approved", "rejected", "posted"];

const expenseLineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 500 },
    amount: { type: Number, required: true, min: 0 },
    glAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      required: true,
    },
    attachmentUrl: { type: String, trim: true, default: "", maxlength: 2048 },
  },
  { _id: true }
);

const expenseReportSchema = new mongoose.Schema(
  {
    expenseNumber: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: EXPENSE_STATUSES,
      default: "draft",
      index: true,
    },
    currency: { type: String, default: "USD", trim: true, uppercase: true },
    lines: { type: [expenseLineSchema], default: [] },
    total: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true, default: "", maxlength: 4000 },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectReason: { type: String, trim: true, default: "", maxlength: 2000 },
    journalEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

expenseReportSchema.plugin(orgScopePlugin);
expenseReportSchema.index(
  { organization: 1, expenseNumber: 1 },
  { unique: true, partialFilterExpression: { organization: { $type: "objectId" } } }
);

module.exports = mongoose.model("ExpenseReport", expenseReportSchema);
module.exports.EXPENSE_STATUSES = EXPENSE_STATUSES;
