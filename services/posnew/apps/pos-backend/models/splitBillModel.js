const mongoose = require("mongoose");

const SPLIT_METHODS = ["equal", "by_item", "custom"];
const SPLIT_STATUSES = ["pending", "partial", "paid"];

const splitEntrySchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "" },
    amount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    orderItemIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    status: {
      type: String,
      enum: SPLIT_STATUSES,
      default: "pending",
    },
    paymentMethod: { type: String, trim: true, default: "" },
    paidAt: { type: Date, default: null },
  },
  { _id: true }
);

const splitBillSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    method: {
      type: String,
      enum: SPLIT_METHODS,
      required: true,
    },
    splits: {
      type: [splitEntrySchema],
      default: [],
    },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: SPLIT_STATUSES,
      default: "pending",
      index: true,
    },
    closedAt: { type: Date, default: null },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

splitBillSchema.index(
  { organization: 1, order: 1, status: 1 },
  {
    partialFilterExpression: { status: { $in: ["pending", "partial"] } },
  }
);

module.exports = mongoose.model("SplitBill", splitBillSchema);
module.exports.SPLIT_METHODS = SPLIT_METHODS;
module.exports.SPLIT_STATUSES = SPLIT_STATUSES;
