const Order = require("../models/orderModel");
const { assertWithinLimit, incrementUsage } = require("./entitlementService");

/**
 * If Razorpay payment finalized a POS order that was not yet entitlement-counted,
 * apply the same assert + increment + flag as orderController (idempotent).
 */
async function syncOrderEntitlementFromRazorpayOrderId(razorpayOrderId) {
  if (razorpayOrderId == null || String(razorpayOrderId).trim() === "") {
    return { synced: false, reason: "no_order_id" };
  }
  const rid = String(razorpayOrderId).trim();
  const order = await Order.findOne({
    "paymentData.razorpay_order_id": rid,
  }).select(
    "organization orderStatus entitlementOrderUsageCounted paymentData"
  );
  if (!order) {
    return { synced: false, reason: "order_not_found" };
  }
  if (!order.organization) {
    return { synced: false, reason: "order_no_organization" };
  }
  const paid =
    String(order.orderStatus || "").toLowerCase() === "paid" ||
    String(order.orderStatus || "").toLowerCase() === "completed";
  if (!paid) {
    return { synced: false, reason: "order_not_paid" };
  }
  if (order.entitlementOrderUsageCounted) {
    return { synced: false, reason: "already_counted" };
  }

  await assertWithinLimit(order.organization, "orders", 1);
  await incrementUsage(order.organization, "orders", 1);
  order.entitlementOrderUsageCounted = true;
  await order.save();
  return { synced: true, orderId: String(order._id) };
}

module.exports = { syncOrderEntitlementFromRazorpayOrderId };
