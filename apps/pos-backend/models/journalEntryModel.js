const mongoose = require("mongoose");

const SOURCE_TYPES = [
  "manual",
  "order_sale",
  "order_reversal",
  "order_cogs",
  "order_refund",
  "cogs_refund",
  "session_close",
  "adjustment",
  "ar_payment",
  "sync_buffer",
  "period_close",
  "gift_card_issue",
  "gift_card_redeem",
  "fx_realized",
  "vendor_bill",
  "vendor_bill_payment",
  "vendor_bill_void",
  "credit_note",
  "grni_accrual",
  "stock_take",
  /** Posted when a vendor return (RTV) is confirmed: reduces AP and inventory at cost. */
  "vendor_return_gl",
  "expense_report",
];

const journalLineSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      required: true,
    },
    /** Amounts in company (functional) currency when multi-currency */
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    /** Original document-currency amounts before FX (optional) */
    documentDebit: { type: Number, default: null },
    documentCredit: { type: Number, default: null },
    memo: { type: String, default: "" },
    analytics: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: true }
);

const journalEntrySchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    entryNumber: { type: Number, required: true, index: true },
    entryDate: { type: Date, required: true, default: Date.now, index: true },
    memo: { type: String, default: "" },
    sourceType: {
      type: String,
      enum: SOURCE_TYPES,
      required: true,
      index: true,
    },
    /** Order, session, or manual reference */
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingSession",
      default: null,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
    },
    lines: {
      type: [journalLineSchema],
      validate: [(v) => Array.isArray(v) && v.length > 0, "Lines required"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /** Offline / API idempotency — same key returns same entry */
    idempotencyKey: { type: String, default: null, sparse: true },
    /** ISO 4217 company / reporting currency */
    companyCurrency: { type: String, default: "USD", trim: true, uppercase: true },
    /** Document (transaction) currency when different */
    documentCurrency: { type: String, default: null, trim: true, uppercase: true },
    /** Multiply document amounts to company currency (1 = no FX) */
    fxRateToCompany: { type: Number, default: 1 },
    /** Free-form metadata (tax breakdown, export tags, sync batch id) */
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    cashFlowCategory: {
      type: String,
      enum: ["operating", "investing", "financing", "none"],
      default: "none",
      index: true,
    },
  },
  { timestamps: true }
);

journalEntrySchema.index(
  { organization: 1, sourceType: 1, sourceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organization: { $type: "objectId" },
      sourceType: {
        $in: ["order_sale", "order_reversal", "order_cogs", "stock_take"],
      },
      sourceId: { $exists: true, $ne: null },
    },
  }
);

journalEntrySchema.index(
  { organization: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organization: { $type: "objectId" },
      idempotencyKey: { $exists: true, $ne: null, $type: "string" },
    },
  }
);

journalEntrySchema.index(
  { organization: 1, entryNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { organization: { $type: "objectId" } },
  }
);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

journalEntrySchema.pre("validate", function (next) {
  if (!this.lines || !this.lines.length) {
    return next();
  }
  let d = 0;
  let c = 0;
  for (const line of this.lines) {
    const dr = round2(line.debit);
    const cr = round2(line.credit);
    if (dr > 0 && cr > 0) {
      return next(new Error("Journal line cannot have both debit and credit."));
    }
    if (dr < 0 || cr < 0) {
      return next(new Error("Journal amounts cannot be negative."));
    }
    d += dr;
    c += cr;
  }
  if (round2(d) !== round2(c)) {
    return next(
      new Error(
        `Journal not balanced: debits ${round2(d)} vs credits ${round2(c)}.`
      )
    );
  }
  next();
});

module.exports = mongoose.model("JournalEntry", journalEntrySchema);
module.exports.SOURCE_TYPES = SOURCE_TYPES;
