const mongoose = require("mongoose");

const integrationConfigSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
    },
    bigcapital: {
      enabled: { type: Boolean, default: false },
      internalBaseUrl: { type: String, default: "" },
      internalSecret: { type: String, default: "" },
      financeTenantId: { type: Number },
      defaultWalkInCustomerId: { type: Number },
      defaultCashDepositAccountId: { type: Number },
      defaultCardDepositAccountId: { type: Number },
      /** Fallback Bigcapital warehouse when order location has no mapping. */
      defaultWarehouseId: { type: Number },
      /** Optional Finance item for service charge lines on receipts. */
      serviceChargeItemId: { type: Number },
      /** Optional Finance item for order-level discount lines on receipts. */
      discountItemId: { type: Number },
      /** Finance item for partial refund credit notes (falls back to discountItemId). */
      refundAdjustmentItemId: { type: Number },
      /** POS location → Bigcapital branch/warehouse. */
      locationMapping: [
        {
          posLocationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Location",
            required: true,
          },
          bigcapitalBranchId: { type: Number },
          bigcapitalWarehouseId: { type: Number },
        },
      ],
      lastSyncedAt: { type: Date },
      lastSyncError: { type: String },
      syncStatus: {
        type: String,
        enum: ["idle", "syncing", "error"],
        default: "idle",
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IntegrationConfig", integrationConfigSchema);
