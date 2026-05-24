const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const MATCH_STATUSES = [
  "pending",
  "matched",
  "quantity_mismatch",
  "price_mismatch",
  "overridden",
  "resolved",
];

const reconciliationActionSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["override", "resolve"],
      required: true,
    },
    reason: { type: String, trim: true, default: "" },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    performedByEmail: { type: String, trim: true, default: "" },
    performedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const threeWayMatchSchema = new mongoose.Schema(
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
    vendorBill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorBill",
      required: true,
      index: true,
    },
    matchStatus: {
      type: String,
      enum: MATCH_STATUSES,
      default: "pending",
      index: true,
    },
    discrepancyNotes: { type: String, default: "" },
    lastMatchedAt: { type: Date, default: Date.now },
    /** Audit trail of manual overrides / resolutions. Append-only. */
    actionHistory: { type: [reconciliationActionSchema], default: [] },
  },
  { timestamps: true }
);

threeWayMatchSchema.plugin(orgScopePlugin);
threeWayMatchSchema.index({ organization: 1, purchaseOrder: 1, vendorBill: 1 }, { unique: true });

module.exports = mongoose.model("ThreeWayMatch", threeWayMatchSchema);
module.exports.MATCH_STATUSES = MATCH_STATUSES;
