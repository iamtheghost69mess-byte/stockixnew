const mongoose = require("mongoose");

const platformNotificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, default: "" },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
    },
    href: { type: String, default: null },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "PlatformUser" }]
  },
  { timestamps: true }
);

platformNotificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PlatformNotification", platformNotificationSchema);
