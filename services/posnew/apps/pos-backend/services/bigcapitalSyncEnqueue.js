const IntegrationConfig = require("../models/integrationConfigModel");
const { recordAndDispatchAccountingSync } = require("./accountingIntegrationOutbox");

/**
 * Queue a paid order for Bigcapital sync (durable outbox + BullMQ when Redis up).
 * @param {import('mongoose').Document} order
 * @param {object} [opts]
 * @param {string} [opts.originatedBy]
 */
async function enqueueBigcapitalSyncIfEnabled(order, opts = {}) {
  const orgId = order?.organization;
  if (!orgId) return;

  const cfg = await IntegrationConfig.findOne({ organization: orgId }).lean();
  if (!cfg?.bigcapital?.enabled) return;

  await recordAndDispatchAccountingSync({
    organizationId: String(orgId),
    orderId: String(order._id),
    eventType: "sync_paid_order",
    idempotencyKey: `bigcapital_order_${order._id}`,
    originatedBy: opts.originatedBy || "order.paid",
    payload: {},
  });
}

/**
 * Queue Finance receipt void by order reference (full reversal / full refund).
 * @param {import('mongoose').Document} order
 * @param {object} [opts]
 * @param {string} [opts.originatedBy]
 */
async function enqueueBigcapitalVoidIfEnabled(order, opts = {}) {
  const orgId = order?.organization;
  if (!orgId) return;

  try {
    const cfg = await IntegrationConfig.findOne({ organization: orgId }).lean();
    if (!cfg?.bigcapital?.enabled) return;

    await recordAndDispatchAccountingSync({
      organizationId: String(orgId),
      orderId: String(order._id),
      eventType: "void_receipt",
      idempotencyKey: `bigcapital_void_${order._id}`,
      originatedBy: opts.originatedBy || "order.void",
      payload: {},
    });
  } catch (err) {
    console.error("[BigcapitalVoid] Enqueue failed:", err.message);
  }
}

/**
 * Queue Finance partial refund adjustment (credit note).
 * @param {import('mongoose').Document} order
 * @param {number} amount
 * @param {object} [opts]
 * @param {string} [opts.idempotencyKey]
 * @param {string} [opts.originatedBy]
 */
async function enqueueBigcapitalPartialRefundIfEnabled(order, amount, opts = {}) {
  const orgId = order?.organization;
  if (!orgId) return;

  const refundAmount = Number(amount);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) return;

  try {
    const cfg = await IntegrationConfig.findOne({ organization: orgId }).lean();
    if (!cfg?.bigcapital?.enabled) return;

    const idem =
      opts.idempotencyKey ||
      `bigcapital_partial_refund_${order._id}_${refundAmount.toFixed(2)}`;

    await recordAndDispatchAccountingSync({
      organizationId: String(orgId),
      orderId: String(order._id),
      eventType: "partial_refund",
      idempotencyKey: idem,
      originatedBy: opts.originatedBy || "order.partial_refund",
      payload: { amount: refundAmount },
    });
  } catch (err) {
    console.error("[BigcapitalPartialRefund] Enqueue failed:", err.message);
  }
}

module.exports = {
  enqueueBigcapitalSyncIfEnabled,
  enqueueBigcapitalVoidIfEnabled,
  enqueueBigcapitalPartialRefundIfEnabled,
};
