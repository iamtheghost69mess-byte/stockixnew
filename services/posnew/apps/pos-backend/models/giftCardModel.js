const mongoose = require("mongoose");

const giftCardSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true, trim: true },
    balance: { type: Number, default: 0, min: 0 },
    initialAmount: { type: Number, default: 0, min: 0 },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "redeemed", "expired", "void"],
      default: "active",
      index: true,
    },
    lastRedeemedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

giftCardSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model("GiftCard", giftCardSchema);
