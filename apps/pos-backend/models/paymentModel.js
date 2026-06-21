const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const paymentSchema = new mongoose.Schema(
  {
    paymentId: String,
    orderId: String,
    amount: Number,
    currency: String,
    status: String,
    method: String,
    email: String,
    contact: String,
    createdAt: Date,
  },
  { timestamps: true }
);

paymentSchema.plugin(orgScopePlugin);
paymentSchema.index({ organization: 1, orderId: 1 });
paymentSchema.index({ organization: 1, createdAt: -1 });

const Payment = mongoose.model("Payment", paymentSchema);
module.exports = Payment;