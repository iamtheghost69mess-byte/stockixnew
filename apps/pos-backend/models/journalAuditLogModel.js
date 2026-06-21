const mongoose = require("mongoose");

/**
 * Append-only audit trail for journal postings (financial traceability).
 */
const journalAuditLogSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    journalEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
      index: true,
    },
    idempotencyKey: { type: String, default: "", index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

journalAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("JournalAuditLog", journalAuditLogSchema);
