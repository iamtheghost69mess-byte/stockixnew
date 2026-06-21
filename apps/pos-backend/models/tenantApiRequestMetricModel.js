const mongoose = require("mongoose");

const tenantApiRequestMetricSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    dayUtc: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    method: { type: String, required: true, trim: true, uppercase: true },
    endpointKey: { type: String, required: true, trim: true },
    statusFamily: {
      type: String,
      required: true,
      enum: ["2xx", "3xx", "4xx", "5xx", "other"],
      default: "other",
    },
    count: { type: Number, required: true, min: 0, default: 0 },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

tenantApiRequestMetricSchema.index(
  { organization: 1, dayUtc: 1, method: 1, endpointKey: 1, statusFamily: 1 },
  { unique: true }
);
tenantApiRequestMetricSchema.index({ organization: 1, dayUtc: -1, count: -1 });

module.exports = mongoose.model("TenantApiRequestMetric", tenantApiRequestMetricSchema);
