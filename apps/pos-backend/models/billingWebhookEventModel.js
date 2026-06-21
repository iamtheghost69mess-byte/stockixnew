const mongoose = require("mongoose");

const billingWebhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, trim: true, required: true, index: true },
    providerEventId: { type: String, trim: true, required: true },
    payloadHash: { type: String, trim: true, default: "" },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: undefined },
    processingOutcome: {
      type: String,
      enum: ["received", "processed", "failed"],
      default: "received",
    },
    errorMessage: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

billingWebhookEventSchema.index(
  { provider: 1, providerEventId: 1 },
  { unique: true }
);

module.exports = mongoose.model("BillingWebhookEvent", billingWebhookEventSchema);
