const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

/**
 * One row per manual discount application (staff/manager), for reporting.
 */
const discountAuditSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    /** Snapshot of table number at time of discount (for lists without joining). */
    tableNo: { type: Number, required: true },
    /** Amount due before this discount increment (after prior manual discounts). */
    totalBefore: { type: Number, required: true },
    /** Amount due after this discount increment. */
    totalAfter: { type: Number, required: true },
    /** Discount added in this action (document currency, same as order). */
    discountAmount: { type: Number, required: true, min: 0 },
    /** percent = percentage discount, fixed = fixed amount discount. */
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "fixed",
      index: true,
    },
    /** bill = check-level discount, item = line-level discount. */
    discountScope: {
      type: String,
      enum: ["bill", "item"],
      default: "bill",
      index: true,
    },
    /** User-entered value (e.g. 10 for 10% OR 5 for fixed $5). */
    discountValue: { type: Number, required: true, min: 0 },
    orderItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    orderItemName: { type: String, trim: true, default: "" },
    reason: { type: String, trim: true, default: "" },
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

discountAuditSchema.plugin(orgScopePlugin);
discountAuditSchema.index({ organization: 1, createdAt: -1 });
discountAuditSchema.index({ createdAt: -1 });

module.exports = mongoose.model("DiscountAudit", discountAuditSchema);
