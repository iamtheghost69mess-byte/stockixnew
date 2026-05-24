const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const CN_STATUSES = ["draft", "posted", "void"];

const creditNoteSchema = new mongoose.Schema(
  {
    creditNoteNumber: { type: String, required: true, index: true },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingInvoice",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: CN_STATUSES,
      default: "posted",
      index: true,
    },
    issueDate: { type: Date, required: true, default: Date.now },
    currency: { type: String, default: "USD", trim: true, uppercase: true },
    subtotal: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    reason: { type: String, default: "", trim: true },
    /** Link to General Ledger entry generated for this credit note */
    journalEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
      index: true,
    },
    /** When the credit note was posted to GL */
    postedAt: { type: Date, default: null },
    /** User who posted the credit note */
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

creditNoteSchema.plugin(orgScopePlugin);

creditNoteSchema.index({ customer: 1, status: 1, issueDate: 1 });
creditNoteSchema.index(
  { organization: 1, creditNoteNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { organization: { $type: "objectId" } },
  }
);

module.exports = mongoose.model("CreditNote", creditNoteSchema);
module.exports.CN_STATUSES = CN_STATUSES;
