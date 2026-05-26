const mongoose = require("mongoose");

const EVENT_TYPES = [
  "sync_paid_order",
  "void_receipt",
  "partial_refund",
  "grn_bill",
  "inventory_adjustment",
  "stock_take_variance",
];

const STATUSES = ["pending", "queued", "processing", "completed", "failed"];

const accountingIntegrationOutboxSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: EVENT_TYPES,
      required: true,
    },
    /** Trace source, e.g. orderController.patchOrderStatus */
    originatedBy: { type: String, trim: true, default: "" },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      index: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: STATUSES,
      default: "pending",
      index: true,
    },
    idempotencyKey: { type: String, required: true, trim: true, unique: true },
    bullJobId: { type: String, trim: true, default: "" },
    attemptCount: { type: Number, default: 0, min: 0 },
    lastError: { type: String, trim: true, default: "" },
    nextAttemptAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

accountingIntegrationOutboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

module.exports = mongoose.model(
  "AccountingIntegrationOutbox",
  accountingIntegrationOutboxSchema
);
module.exports.EVENT_TYPES = EVENT_TYPES;
module.exports.STATUSES = STATUSES;
