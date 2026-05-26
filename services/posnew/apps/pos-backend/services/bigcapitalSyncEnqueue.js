const IntegrationConfig = require("../models/integrationConfigModel");
const { dispatchAccountingIntegrationEvent } = require("./accountingIntegrationEvents");

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

  await dispatchAccountingIntegrationEvent({
    organizationId: String(orgId),
    resourceId: String(order._id),
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

    await dispatchAccountingIntegrationEvent({
      organizationId: String(orgId),
      resourceId: String(order._id),
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

    await dispatchAccountingIntegrationEvent({
      organizationId: String(orgId),
      resourceId: String(order._id),
      eventType: "partial_refund",
      idempotencyKey: idem,
      originatedBy: opts.originatedBy || "order.partial_refund",
      payload: { amount: refundAmount },
    });
  } catch (err) {
    console.error("[BigcapitalPartialRefund] Enqueue failed:", err.message);
  }
}

/**
 * Queue Finance AP bill for a confirmed GRN.
 * @param {import('mongoose').Document} grn
 * @param {object} [opts]
 */
async function enqueueBigcapitalGrnBillIfEnabled(grn, opts = {}) {
  const orgId = grn?.organization;
  if (!orgId || !grn?._id) return;

  try {
    const cfg = await IntegrationConfig.findOne({ organization: orgId }).lean();
    if (!cfg?.bigcapital?.enabled) return;

    await dispatchAccountingIntegrationEvent({
      organizationId: String(orgId),
      resourceId: String(grn._id),
      eventType: "grn_bill",
      idempotencyKey: `bigcapital_grn_${grn._id}`,
      originatedBy: opts.originatedBy || "grn.confirm",
      payload: { grnId: String(grn._id) },
    });
  } catch (err) {
    console.error("[BigcapitalGrn] Enqueue failed:", err.message);
  }
}

/**
 * Queue Finance inventory variance for a stock adjustment.
 * @param {object} params
 */
async function enqueueBigcapitalInventoryAdjustIfEnabled(params, opts = {}) {
  const orgId = params?.organizationId;
  if (!orgId || !params?.ingredientId) return;

  const delta = Number(params.delta);
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-9) return;

  try {
    const cfg = await IntegrationConfig.findOne({ organization: orgId }).lean();
    if (!cfg?.bigcapital?.enabled) return;

    const ref =
      params.referenceNo ||
      `pos-adjust-${params.ingredientId}-${Math.abs(delta).toFixed(4)}-${params.reason || "adj"}`;

    await dispatchAccountingIntegrationEvent({
      organizationId: String(orgId),
      resourceId: String(params.ingredientId),
      eventType: "inventory_adjustment",
      idempotencyKey: opts.idempotencyKey || `bigcapital_inv_adj_${ref}`,
      originatedBy: opts.originatedBy || "inventory.adjust",
      payload: {
        ingredientId: String(params.ingredientId),
        delta,
        unitCost: Number(params.unitCost) || 0,
        reason: params.reason || "",
        referenceNo: ref,
        description: params.description || "",
      },
    });
  } catch (err) {
    console.error("[BigcapitalInventoryAdjust] Enqueue failed:", err.message);
  }
}

/**
 * Queue Finance variance journal for a posted stock take session.
 * @param {import('mongoose').Document} session
 * @param {object} [opts]
 */
async function enqueueBigcapitalStockTakeIfEnabled(session, opts = {}) {
  const orgId = session?.organization;
  if (!orgId || !session?._id) return;

  try {
    const cfg = await IntegrationConfig.findOne({ organization: orgId }).lean();
    if (!cfg?.bigcapital?.enabled) return;

    await dispatchAccountingIntegrationEvent({
      organizationId: String(orgId),
      resourceId: String(session._id),
      eventType: "stock_take_variance",
      idempotencyKey: `bigcapital_stocktake_${session._id}`,
      originatedBy: opts.originatedBy || "stock_take.post",
      payload: { stockTakeSessionId: String(session._id) },
    });
  } catch (err) {
    console.error("[BigcapitalStockTake] Enqueue failed:", err.message);
  }
}

module.exports = {
  enqueueBigcapitalSyncIfEnabled,
  enqueueBigcapitalVoidIfEnabled,
  enqueueBigcapitalPartialRefundIfEnabled,
  enqueueBigcapitalGrnBillIfEnabled,
  enqueueBigcapitalInventoryAdjustIfEnabled,
  enqueueBigcapitalStockTakeIfEnabled,
};
