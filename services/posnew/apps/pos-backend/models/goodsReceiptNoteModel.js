const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const GRN_STATUSES = ["draft", "confirmed", "qc_pending", "qc_failed", "cancelled"];

const goodsReceiptNoteLineSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
    },
    /** PO line subdocument id (stringified) for receive posting and three-way match. */
    purchaseOrderLineId: { type: String, trim: true, default: "" },
    quantityExpected: { type: Number, required: true, min: 0 },
    quantityReceived: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    lotNumber: { type: String, trim: true, default: "" },
    expiryDate: { type: Date, default: null },
    productionDate: { type: Date, default: null },
    supplierBatchRef: { type: String, trim: true, default: "" },
    rejectedQty: { type: Number, default: 0, min: 0 },
    rejectionReason: { type: String, trim: true, default: "" },
    discrepancyReason: { type: String, trim: true, default: "" },
    qcStatus: {
      type: String,
      enum: ["passed", "failed", "pending"],
      default: "pending",
    },
    notes: { type: String, trim: true, default: "" },
  },
  { _id: true }
);

const goodsReceiptNoteSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      required: true,
      index: true,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
      index: true,
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: GRN_STATUSES,
      default: "draft",
      index: true,
    },
    receivedAt: { type: Date, default: Date.now },
    notes: { type: String, trim: true, default: "" },
    supplierInvoiceRef: { type: String, trim: true, default: "" },
    /** Link to General Ledger entry for inventory accrual (Debit Inventory / Credit GRNI) */
    journalEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
      index: true,
    },
    /** When the receipt was finalized and accounted for */
    postedAt: { type: Date, default: null },
    /** User who posted the receipt to GL */
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lines: { type: [goodsReceiptNoteLineSchema], default: [] },
  },
  { timestamps: true }
);

goodsReceiptNoteSchema.plugin(orgScopePlugin);
goodsReceiptNoteSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model("GoodsReceiptNote", goodsReceiptNoteSchema);
module.exports.GRN_STATUSES = GRN_STATUSES;
