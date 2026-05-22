const mongoose = require("mongoose");

const orgInvitationSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    email: { type: String, required: true, trim: true, lowercase: true },
    roleHint: { type: String, trim: true, default: "waiter" },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orgInvitationSchema.index({ organization: 1, email: 1 });

module.exports = mongoose.model("OrgInvitation", orgInvitationSchema);
