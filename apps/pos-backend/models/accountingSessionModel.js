const mongoose = require("mongoose");

const SESSION_STATUSES = ["open", "closed"];

const accountingSessionSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    sessionNumber: { type: Number, required: true },
    status: {
      type: String,
      enum: SESSION_STATUSES,
      default: "open",
      index: true,
    },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    openingFloat: { type: Number, default: 0, min: 0 },
    /** Cash physically counted at close */
    closingCountedCash: { type: Number, default: null },
    /** Expected cash in drawer from system (optional manual entry at close) */
    expectedCash: { type: Number, default: null },
    discrepancy: { type: Number, default: null },
    discrepancyNote: { type: String, default: "" },
    closeJournalEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    /** Immutable snapshots each time a session is closed with count data (variance audit trail). */
    cashReconciliationLog: {
      type: [
        {
          at: { type: Date, default: Date.now },
          actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
          countedCash: { type: Number, default: null },
          expectedCash: { type: Number, default: null },
          variance: { type: Number, default: null },
          note: { type: String, default: "" },
        },
      ],
      default: [],
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
    },
  },
  { timestamps: true }
);

accountingSessionSchema.index({ status: 1, openedAt: -1 });
accountingSessionSchema.index(
  { organization: 1, sessionNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { organization: { $type: "objectId" } },
  }
);
accountingSessionSchema.index(
  { organization: 1, status: 1 },
  { partialFilterExpression: { organization: { $type: "objectId" } } }
);

module.exports = mongoose.model("AccountingSession", accountingSessionSchema);
module.exports.SESSION_STATUSES = SESSION_STATUSES;
