const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const REASONS = [
  "order_deduction",
  "sale",
  "order_line_void",
  "order_cancel",
  "manual_adjust",
  "waste",
  "wastage",
  "receive",
  "customer_return",
  "vendor_return",
  "correction",
  "transfer_out",
  "transfer_in",
];

const stockMovementSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    /** Positive = stock in; negative = stock out (in ingredient unit). */
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    movementType: {
      type: String,
      enum: ["sale", "wastage", "refund", "adjustment", "receive", "transfer"],
      default: "adjustment",
      index: true,
    },
    reason: { type: String, enum: REASONS, required: true },
    /** True if items returned are qualified to be put back in inventory */
    isRestockable: { type: Boolean, default: true },
    /** Condition of stock during movement (auditing waste/returns) */
    qualityStatus: {
      type: String,
      enum: ["passed", "damaged", "expired", "recalled"],
      default: "passed",
      index: true,
    },
    note: { type: String, trim: true, default: "" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    orderLineId: { type: mongoose.Schema.Types.ObjectId, default: null },
    wastageEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WastageEntry",
      default: null,
      index: true,
    },
    /** Ledger link: reversal row points at the original order_deduction movement. */
    reversesMovement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockMovement",
      default: null,
      index: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** FIFO/WA cost assigned at deduction time (for COGS from movements). */
    costAmount: { type: Number, default: null, min: 0 },
    /** delta * costAmount at time of movement (absolute currency valuation of the change). */
    extendedValue: { type: Number, default: null },
    /** Where quantity changed (null = legacy global). */
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    /** For transfers: the other location. */
    counterLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
    },
    /** Optional link between transfer_out and transfer_in rows. */
    transferGroupId: { type: String, trim: true, default: null, index: true },
    /** Structured waste (e.g. damaged, expired). */
    wasteReasonCode: { type: String, trim: true, default: "" },
    lotNumber: { type: String, trim: true, default: "" },
    expiryDate: { type: Date, default: null },
    productionDate: { type: Date, default: null },
    supplierBatchRef: { type: String, trim: true, default: "" },
    /** True when outbound valuation references opening/manual lots without purchase lineage. */
    isUnverifiedFifoHistory: { type: Boolean, default: false, index: true },
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      default: null,
      index: true,
    },
    purchaseOrderLineId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    /** List of serial numbers for tracked items. */
    serialNumbers: { type: [String], default: [] },
    /** Bin where this movement occurred. */
    bin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bin",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

stockMovementSchema.plugin(orgScopePlugin);
stockMovementSchema.index({ organization: 1, createdAt: -1 });
stockMovementSchema.index({ organization: 1, ingredient: 1, createdAt: -1 });
stockMovementSchema.index({ organization: 1, reason: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ order: 1, orderLineId: 1, reason: 1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
module.exports.REASONS = REASONS;
