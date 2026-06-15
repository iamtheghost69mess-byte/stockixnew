const mongoose = require("mongoose");

const SUB_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "none",
];

const subscriptionSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    planKey: { type: String, trim: true, required: true },
    status: {
      type: String,
      enum: SUB_STATUSES,
      default: "none",
      index: true,
    },
    provider: { type: String, trim: true, default: "stub" },
    providerCustomerId: { type: String, trim: true, default: "" },
    providerSubscriptionId: { type: String, trim: true, default: "" },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    trialStart: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    prorationPolicy: {
      type: String,
      trim: true,
      default: "provider_handles",
    },
  },
  { timestamps: true }
);

subscriptionSchema.index({ organization: 1, status: 1 });

const Subscription = mongoose.model("Subscription", subscriptionSchema);
Subscription.SUB_STATUSES = SUB_STATUSES;
module.exports = Subscription;
