const mongoose = require("mongoose");

const productEventSchema = new mongoose.Schema(
  {
    eventType: { type: String, required: true, trim: true, index: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    occurredAt: { type: Date, default: Date.now, index: true },
    actor: {
      kind: { type: String, enum: ["user", "platform_user", "system"], default: "system" },
      id: { type: String, trim: true, default: "" },
    },
    correlationId: { type: String, trim: true, default: "", index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

productEventSchema.index({ organization: 1, eventType: 1, occurredAt: -1 });

module.exports = mongoose.model("ProductEvent", productEventSchema);
