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
