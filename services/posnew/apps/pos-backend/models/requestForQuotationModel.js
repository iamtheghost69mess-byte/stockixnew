const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const RFQ_STATUSES = ["draft", "sent", "received", "converted", "cancelled"];

const rfqLineSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
    },
    description: { type: String, trim: true, default: "" },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const rfqResponseLineSchema = new mongoose.Schema({
  rfqLineId: { type: mongoose.Schema.Types.ObjectId, required: true },
  unitCost: { type: Number, required: true, min: 0 },
}, { _id: false });

const rfqResponseSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    /** Deprecated: use lineCosts */
    unitCost: { type: Number, min: 0, default: 0 },
    lineCosts: { type: [rfqResponseLineSchema], default: [] },
    availableDate: { type: Date, default: null },
    expiryQuoteDate: { type: Date, default: null },
    notes: { type: String, trim: true, default: "" },
    isSelected: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true }
);

const requestForQuotationSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    reference: { type: String, trim: true, default: "" },
    suppliers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Supplier",
      },
    ],
    status: {
      type: String,
      enum: RFQ_STATUSES,
      default: "draft",
      index: true,
    },
    expectedAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: "" },
    lines: { type: [rfqLineSchema], default: [] },
    responses: { type: [rfqResponseSchema], default: [] },
    convertedToPurchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      default: null,
    },
  },
  { timestamps: true }
);

requestForQuotationSchema.plugin(orgScopePlugin);
requestForQuotationSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model("RequestForQuotation", requestForQuotationSchema);
module.exports.RFQ_STATUSES = RFQ_STATUSES;
