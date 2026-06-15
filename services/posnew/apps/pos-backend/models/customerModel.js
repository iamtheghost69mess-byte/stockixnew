const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    loyaltyCard: { type: String, trim: true, sparse: true, unique: true },
    vatNumber: { type: String, trim: true, default: "" },
    /** Explicitly marked as eligible for AR/billing flows (recurring invoices, contracts). */
    isBillingCustomer: { type: Boolean, default: false, index: true },
    notes: { type: String, trim: true, default: "" },
    /** Running AR balance (company currency); updated by accounting postings */
    arBalance: { type: Number, default: 0 },
    /** Excess payments recorded as customer deposits (liability); company currency */
    unappliedCredit: { type: Number, default: 0 },
  },
  { timestamps: true }
);

customerSchema.index({ organization: 1, name: 1 });
customerSchema.index({ organization: 1, phone: 1 });
customerSchema.index({ name: 1 });
customerSchema.index({ phone: 1 });

module.exports = mongoose.model("Customer", customerSchema);
