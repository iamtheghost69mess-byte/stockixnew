const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const recurringInvoiceTemplateSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      required: true,
    },
    /** Template becomes active only when now >= startAt (if set). */
    startAt: { type: Date, default: null },
    /** Template stops issuing when now > endAt (if set). */
    endAt: { type: Date, default: null },
    nextIssueAt: { type: Date, required: true },
    lastIssuedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    status: {
      type: String,
      enum: ["active", "paused", "completed", "expired"],
      default: "active",
      index: true,
    },
    timezone: { type: String, default: "UTC", trim: true },
    dueDays: { type: Number, default: 14, min: 1, max: 365 },
    currency: { type: String, default: "USD", trim: true, uppercase: true },
    templateLinesCount: { type: Number, default: 0 }, // For quick summary
    templateLines: [
      {
        description: { type: String, required: true },
        quantity: { type: Number, required: true, min: 0 },
        unitPrice: { type: Number, required: true, min: 0 },
        taxCode: { type: String, default: null },
      }
    ],
    notes: { type: String, trim: true, default: "" },
    /** Last execution records (worker/manual) for observability. */
    runLogs: {
      type: [
        {
          runAt: { type: Date, required: true, default: Date.now },
          status: { type: String, enum: ["success", "failed", "skipped"], required: true },
          trigger: { type: String, enum: ["worker", "manual"], required: true },
          invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "AccountingInvoice", default: null },
          invoiceNumber: { type: String, default: "" },
          message: { type: String, default: "" },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

recurringInvoiceTemplateSchema.plugin(orgScopePlugin);

module.exports = mongoose.model("RecurringInvoiceTemplate", recurringInvoiceTemplateSchema);
