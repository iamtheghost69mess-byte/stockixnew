const mongoose = require("mongoose");

const platformAuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, index: true },
    actorType: {
      type: String,
      enum: ["platform_user", "api_key", "system"],
      default: "platform_user",
    },
    actorPlatformUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlatformUser",
      default: null,
    },
    actorApiKeyPrefix: { type: String, trim: true, default: "" },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    /** Minimized detail — avoid raw PII in audits */
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
    requestId: { type: String, trim: true, default: "" },
    traceparent: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

platformAuditLogSchema.index({ createdAt: -1 });
platformAuditLogSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model("PlatformAuditLog", platformAuditLogSchema);
