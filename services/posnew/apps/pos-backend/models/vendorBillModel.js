const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const BILL_STATUSES = ["draft", "posted", "partial", "paid", "void"];

const vendorBillLineSchema = new mongoose.Schema(
  {
    itemDescription: { type: String, required: true, trim: true },
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      default: null,
    },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const vendorBillSchema = new mongoose.Schema(
  {
    vendorBillNumber: { type: String, required: true, index: true },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: BILL_STATUSES,
      default: "draft",
      index: true,
    },
    billDate: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true },
    currency: { type: String, default: "USD", trim: true, uppercase: true },
    subtotal: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    /** Calculated field: total - amountPaid */
    amountRemaining: { type: Number, default: 0, min: 0 },
    /** Commercial payment terms for this bill */
    paymentTerms: {
      type: String,
      enum: ["Immediate", "Net 15", "Net 30", "Net 60", "Due on Receipt"],
      default: "Due on Receipt",
    },
    /** Header-level discount percentage applied by vendor */
    discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
    /** Link to the General Ledger entry for this bill */
    journalEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
      index: true,
    },
    /** When the bill was posted to GL */
    postedAt: { type: Date, default: null },
    /** User who posted the bill */
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** Internal cost center or department for reporting */
    costCenter: { type: String, trim: true, default: "" },
    notes: { type: String, default: "", trim: true },
    lines: { type: [vendorBillLineSchema], default: [] },
  },
  { timestamps: true }
);

vendorBillSchema.plugin(orgScopePlugin);

vendorBillSchema.index({ supplier: 1, status: 1, dueDate: 1 });
vendorBillSchema.index(
  { organization: 1, vendorBillNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { organization: { $type: "objectId" } },
  }
);

module.exports = mongoose.model("VendorBill", vendorBillSchema);
module.exports.BILL_STATUSES = BILL_STATUSES;
