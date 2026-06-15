const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    nickname: {
      type: String,
      default: null,
      trim: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "revoked"],
      default: "pending",
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

deviceSchema.index({ organization: 1, status: 1, createdAt: -1 });
deviceSchema.index({ organization: 1, lastSeenAt: -1 });

module.exports = mongoose.model("Device", deviceSchema);
