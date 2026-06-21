const mongoose = require("mongoose");

/**
 * Append-only inventory audit events (operational traceability; not a replacement for StockMovement).
 */
const inventoryAuditEventSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    action: { type: String, required: true, trim: true, index: true },
    sourceType: { type: String, trim: true, default: "" },
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

inventoryAuditEventSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model("InventoryAuditEvent", inventoryAuditEventSchema);
