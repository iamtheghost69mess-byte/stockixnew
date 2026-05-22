const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const backofficeNotificationSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    type: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "", trim: true },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
      index: true,
    },
    sourceType: { type: String, default: "", trim: true },
    sourceId: { type: String, default: "", trim: true },
    dedupeKey: { type: String, default: "", trim: true, index: true },
    href: { type: String, default: "", trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

backofficeNotificationSchema.plugin(orgScopePlugin);
backofficeNotificationSchema.index({ organization: 1, createdAt: -1 });
backofficeNotificationSchema.index({ organization: 1, severity: 1, createdAt: -1 });
backofficeNotificationSchema.index({ organization: 1, type: 1, createdAt: -1 });
backofficeNotificationSchema.index({ organization: 1, dedupeKey: 1, createdAt: -1 });

module.exports = mongoose.model("BackofficeNotification", backofficeNotificationSchema);
