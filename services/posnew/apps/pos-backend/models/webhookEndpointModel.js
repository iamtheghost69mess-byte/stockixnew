const mongoose = require("mongoose");

const webhookEndpointSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    url: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    signingSecretCurrent: { type: String, required: true, select: false },
    signingSecretPrevious: { type: String, select: false, default: "" },
    previousSecretValidUntil: { type: Date, default: null },
    eventTypes: { type: [String], default: () => ["*"] },
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

webhookEndpointSchema.index({ organization: 1, disabled: 1 });

module.exports = mongoose.model("WebhookEndpoint", webhookEndpointSchema);
