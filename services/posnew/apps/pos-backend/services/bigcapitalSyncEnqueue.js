const IntegrationConfig = require("../models/integrationConfigModel");
const { addJob } = require("./jobQueue");

const QUEUE_NAME = "bigcapital_sync";

/**
 * Queue a paid order for Bigcapital sync (non-blocking; does not wait for worker).
 * @param {import('mongoose').Document} order
 */
async function enqueueBigcapitalSyncIfEnabled(order) {
  const orgId = order?.organization;
  if (!orgId) return;

  const cfg = await IntegrationConfig.findOne({ organization: orgId }).lean();
  if (!cfg?.bigcapital?.enabled) return;

  await addJob(
    QUEUE_NAME,
    "sync_paid_order",
    {
      orderId: String(order._id),
      organizationId: String(orgId),
    },
    {
      jobId: `bigcapital_order_${order._id}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    }
  );
}

/**
 * Queue Finance receipt void by order reference (full reversal / full refund).
 * @param {import('mongoose').Document} order
 */
async function enqueueBigcapitalVoidIfEnabled(order) {
  const orgId = order?.organization;
  if (!orgId) return;

  try {
    const cfg = await IntegrationConfig.findOne({ organization: orgId }).lean();
    if (!cfg?.bigcapital?.enabled) return;

    await addJob(
      QUEUE_NAME,
      "void_receipt",
      {
        orderId: String(order._id),
        organizationId: String(orgId),
      },
      {
        jobId: `bigcapital_void_${order._id}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 10000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      }
    );
  } catch (err) {
    console.error("[BigcapitalVoid] Enqueue failed:", err.message);
  }
}

module.exports = {
  QUEUE_NAME,
  enqueueBigcapitalSyncIfEnabled,
  enqueueBigcapitalVoidIfEnabled,
};
