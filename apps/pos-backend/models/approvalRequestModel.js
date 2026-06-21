const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const TARGET_TYPES = ["vendor_bill", "manual_journal", "expense_report", "vendor_return"];

const APPROVAL_STATUSES = ["pending", "approved", "rejected"];

const approvalRequestSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      enum: TARGET_TYPES,
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: APPROVAL_STATUSES,
      default: "pending",
      index: true,
    },
    notes: { type: String, trim: true, default: "", maxlength: 2000 },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

approvalRequestSchema.plugin(orgScopePlugin);
approvalRequestSchema.index(
  { organization: 1, targetType: 1, targetId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organization: { $type: "objectId" },
      status: "pending",
    },
  }
);

module.exports = mongoose.model("ApprovalRequest", approvalRequestSchema);
module.exports.TARGET_TYPES = TARGET_TYPES;
module.exports.APPROVAL_STATUSES = APPROVAL_STATUSES;
