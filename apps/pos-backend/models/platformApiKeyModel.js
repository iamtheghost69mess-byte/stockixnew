const mongoose = require("mongoose");

const platformApiKeySchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "" },
    keyHash: { type: String, required: true, select: false },
    keyPrefix: { type: String, required: true, trim: true, index: true },
    scopes: { type: [String], default: () => [] },
    createdByPlatformUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlatformUser",
      default: null,
    },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

platformApiKeySchema.index({ keyPrefix: 1, revokedAt: 1 });

module.exports = mongoose.model("PlatformApiKey", platformApiKeySchema);
