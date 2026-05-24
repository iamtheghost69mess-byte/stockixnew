const mongoose = require("mongoose");

/**
 * Bank statement line imported via CSV v1 or matched manually.
 * Dedupe is enforced at the service layer using either `externalId`
 * (when present) or the composite natural key (organization + postedAt
 * + amountCents + normalizedDescription). Unique indexes guard against
 * concurrent imports racing on the same key.
 */
const bankStatementLineSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    postedAt: { type: Date, default: Date.now, index: true },
    description: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    externalId: { type: String, default: "", trim: true, index: true },
    dedupeKey: { type: String, default: "", index: true },
    status: {
      type: String,
      enum: ["unmatched", "matched", "cleared"],
      default: "unmatched",
      index: true,
    },
    matchedJournalLine: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    reconciledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

bankStatementLineSchema.index(
  { organization: 1, externalId: 1 },
  {
    unique: true,
    partialFilterExpression: { externalId: { $exists: true, $gt: "" } },
    name: "uniq_org_externalId_when_present",
  }
);

bankStatementLineSchema.index(
  { organization: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $exists: true, $gt: "" } },
    name: "uniq_org_dedupeKey",
  }
);

module.exports = mongoose.model("BankStatementLine", bankStatementLineSchema);
