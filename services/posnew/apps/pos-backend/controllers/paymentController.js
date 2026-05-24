/**
 * Razorpay gateway helpers (create order, verify signature, webhook).
 *
 * **POS check journal entries:** when an in-store order becomes `paid`, sale/COGS journals are posted from
 * `orderController` via `onOrderBecamePaid` in `accountingService.js` (Mongo transaction with stock). This module
 * does not mutate POS order lifecycle; keep payment gateway logic here and order settlement in `orderController`.
 */
const Razorpay = require("razorpay");
const createHttpError = require("http-errors");
const config = require("../config/config");
const crypto = require("node:crypto");
const Payment = require("../models/paymentModel");
const Order = require("../models/orderModel");
const {
  syncOrderEntitlementFromRazorpayOrderId,
} = require("../services/paymentEntitlementSync");

const createOrder = async (req, res, next) => {
  const razorpay = new Razorpay({
    key_id: config.razorpayKeyId,
    key_secret: config.razorpaySecretKey,
  });

  try {
    const { amount } = req.body;
    const options = {
      amount: amount * 100, // Amount in paisa (1 INR = 100 paisa)
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    res.status(200).json({ success: true, order });
  } catch (error) {
    console.log(error);
    next(error);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const expectedSignature = crypto
      .createHmac("sha256", config.razorpaySecretKey)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      res.json({ success: true, message: "Payment verified successfully!" });
    } else {
      const error = createHttpError(400, "Payment verification failed!");
      return next(error);
    }
  } catch (error) {
    next(error);
  }
};

const webHookVerification = async (req, res, next) => {
  try {
    const secret = config.razorpyWebhookSecret;
    const signature = req.headers["x-razorpay-signature"];

    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body || {}), "utf8");

    // 🛑 Verify the signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature === signature) {
      console.log("✅ Webhook verified:", req.body);

      // ✅ Process payment (e.g., update DB, send confirmation email)
      if (req.body.event === "payment.captured") {
        const payment = req.body.payload.payment.entity;
        console.log(`💰 Payment Captured: ${payment.amount / 100} INR`);

        const rzpOrderId = payment.order_id != null ? String(payment.order_id) : "";
        let organization = null;
        try {
          const posOrder = await Order.findOne({
            "paymentData.razorpay_order_id": rzpOrderId,
          })
            .select("organization")
            .lean();
          organization = posOrder?.organization ?? null;
        } catch (e) {
          console.warn("razorpay webhook: order lookup failed", e.message);
        }
        if (!organization && rzpOrderId) {
          console.warn(
            "razorpay webhook: no POS order matched paymentData.razorpay_order_id",
            rzpOrderId
          );
        }

        const newPayment = new Payment({
          paymentId: payment.id,
          orderId: payment.order_id,
          amount: payment.amount / 100,
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
          email: payment.email,
          contact: payment.contact,
          createdAt: new Date(payment.created_at * 1000),
          organization: organization || undefined,
        });

        try {
          await newPayment.save();
        } catch (e) {
          if (e.code === 11000) {
            console.warn("razorpay webhook: duplicate payment row", payment.id);
          } else {
            throw e;
          }
        }

        try {
          await syncOrderEntitlementFromRazorpayOrderId(rzpOrderId);
        } catch (e) {
          console.warn("razorpay webhook: entitlement sync", e.message);
        }
      }

      res.json({ success: true });
    } else {
      const error = createHttpError(400, "❌ Invalid Signature!");
      return next(error);
    }
  } catch (error) {
    next(error);
  }
};

module.exports = { createOrder, verifyPayment, webHookVerification };
