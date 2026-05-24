const mongoose = require("mongoose");

/**
 * Idempotent record that a batch of offline-synced orders was acknowledged for accounting.
 */
const accountingSyncLogSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    batchId: { type: String, required: true, trim: true },
    orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

accountingSyncLogSchema.index(
  { organization: 1, batchId: 1 },
  {
    unique: true,
    partialFilterExpression: { organization: { $type: "objectId" } },
  }
);

module.exports = mongoose.model("AccountingSyncLog", accountingSyncLogSchema);
