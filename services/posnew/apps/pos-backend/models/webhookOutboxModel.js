const mongoose = require("mongoose");

const webhookOutboxSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    endpoint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WebhookEndpoint",
      required: true,
    },
    eventType: { type: String, required: true, trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "delivered", "failed"],
      default: "pending",
      index: true,
    },
    attemptCount: { type: Number, default: 0, min: 0 },
    lastError: { type: String, trim: true, default: "" },
    nextAttemptAt: { type: Date, default: null },
    idempotencyKey: { type: String, trim: true, sparse: true, unique: true },
  },
  { timestamps: true }
);

webhookOutboxSchema.index({ status: 1, nextAttemptAt: 1 });

module.exports = mongoose.model("WebhookOutbox", webhookOutboxSchema);
