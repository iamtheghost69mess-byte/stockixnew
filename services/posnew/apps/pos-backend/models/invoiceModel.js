const mongoose = require("mongoose");

const INVOICE_STATUSES = ["draft", "open", "paid", "void", "uncollectible"];

const invoiceSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    provider: { type: String, trim: true, default: "stub" },
    providerInvoiceId: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: INVOICE_STATUSES,
      default: "open",
      index: true,
    },
    currency: { type: String, trim: true, uppercase: true, default: "USD" },
    amountDueCents: { type: Number, default: 0, min: 0 },
    amountPaidCents: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date, default: null },
    lines: {
      type: [
        {
          description: String,
          quantity: Number,
          unitAmountCents: Number,
          amountCents: Number,
        },
      ],
      default: undefined,
    },
  },
  { timestamps: true }
);

invoiceSchema.index({ organization: 1, status: 1, updatedAt: -1 });

const Invoice = mongoose.model("Invoice", invoiceSchema);
Invoice.INVOICE_STATUSES = INVOICE_STATUSES;
module.exports = Invoice;
