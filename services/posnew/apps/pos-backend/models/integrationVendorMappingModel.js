const mongoose = require("mongoose");

const integrationVendorMappingSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    posSupplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    bigcapitalVendorId: { type: Number, required: true },
    bigcapitalVendorName: { type: String },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

integrationVendorMappingSchema.index(
  { organization: 1, posSupplierId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "IntegrationVendorMapping",
  integrationVendorMappingSchema
);
