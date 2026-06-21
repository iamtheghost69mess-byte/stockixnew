const mongoose = require("mongoose");

const posAuditLogSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
      alias: "locationId",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
      alias: "userId",
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

posAuditLogSchema.index({ organization: 1, location: 1, action: 1, createdAt: -1 });

module.exports = mongoose.model("PosAuditLog", posAuditLogSchema);
