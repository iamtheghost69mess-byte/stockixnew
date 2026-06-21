const mongoose = require("mongoose");

const fraudReviewCaseSchema = new mongoose.Schema(
  {
    signal: { type: String, required: true, trim: true, index: true },
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FraudReviewCase", fraudReviewCaseSchema);
