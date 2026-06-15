const mongoose = require("mongoose");

const recurringJournalTemplateSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    memo: { type: String, required: true },
    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      required: true,
    },
    nextRunAt: { type: Date, required: true, index: true },
    lastRunAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    status: {
      type: String,
      enum: ["active", "paused", "completed", "expired"],
      default: "active",
      index: true,
    },
    templateLines: [
      {
        account: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "AccountingAccount",
          required: true,
        },
        debit: { type: Number, default: 0 },
        credit: { type: Number, default: 0 },
        memo: { type: String },
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "RecurringJournalTemplate",
  recurringJournalTemplateSchema
);
