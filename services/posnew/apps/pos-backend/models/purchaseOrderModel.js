const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const PO_STATUSES = ["draft", "confirmed", "partial", "received", "cancelled"];

const purchaseOrderLineSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
    },
    description: { type: String, trim: true, default: "" },
    quantityOrdered: { type: Number, required: true, min: 0 },
    quantityReceived: { type: Number, default: 0, min: 0 },
    quantityBilled: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    reference: { type: String, trim: true, default: "" },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
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
      enum: PO_STATUSES,
      default: "draft",
      index: true,
    },
    expectedAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: "" },
    supplierInvoiceRef: { type: String, trim: true, default: "" },
    vendorBill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorBill",
      default: null,
      index: true,
    },
    /** External RFQ reference number if applicable */
    rfqReference: { type: String, trim: true, default: "" },
    /** Status of PO matching with Receipt and Bill */
    threeWayMatchStatus: {
      type: String,
      enum: ["pending", "matched", "mismatch", "overridden"],
      default: "pending",
      index: true,
    },
    /** Internal cost center for departmental reporting */
    costCenter: { type: String, trim: true, default: "" },
    /** Department responsible for the spend */
    department: { type: String, trim: true, default: "" },
    /** True if this is a dropship PO fulfilled directly to a customer */
    isDropship: { type: Boolean, default: false, index: true },
    /** Reference to the customer order being fulfilled via dropship */
    customerOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    lines: { type: [purchaseOrderLineSchema], default: [] },
  },
  { timestamps: true }
);

purchaseOrderSchema.plugin(orgScopePlugin);
purchaseOrderSchema.index({ organization: 1, createdAt: -1 });
purchaseOrderSchema.index({ organization: 1, status: 1 });
purchaseOrderSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
module.exports.PO_STATUSES = PO_STATUSES;
