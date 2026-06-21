const AccountingIntegrationOutbox = require("../models/accountingIntegrationOutboxModel");
const { addJob } = require("./jobQueue");

const QUEUE_NAME = "bigcapital_sync";

const JOB_NAME_BY_EVENT = {
  sync_paid_order: "sync_paid_order",
  void_receipt: "void_receipt",
  partial_refund: "partial_refund",
  grn_bill: "grn_bill",
  inventory_adjustment: "inventory_adjustment",
  stock_take_variance: "stock_take_variance",
};

/**
 * Persist sync intent (durable) then enqueue BullMQ when Redis is available.
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.eventType
 * @param {string} [params.orderId]
 * @param {string} [params.resourceId] - primary resource id when not an order
 * @param {string} params.idempotencyKey
 * @param {string} [params.originatedBy]
 * @param {object} [params.payload]
 */
async function recordAndDispatchAccountingSync(params) {
  const orgId = params.organizationId;
  const resourceId = params.resourceId || params.orderId;
  const eventType = params.eventType;
  const idempotencyKey = String(params.idempotencyKey || "").trim();
  if (!orgId || !resourceId || !eventType || !idempotencyKey) {
    throw new Error("recordAndDispatchAccountingSync: missing required fields");
  }

  const jobName = JOB_NAME_BY_EVENT[eventType];
  if (!jobName) {
    throw new Error(`Unsupported accounting outbox event: ${eventType}`);
  }

  let row = await AccountingIntegrationOutbox.findOne({ idempotencyKey }).lean();
  if (!row) {
    row = await AccountingIntegrationOutbox.create({
      organization: orgId,
      eventType,
      orderId: resourceId,
      originatedBy: params.originatedBy || "",
      payload: params.payload || {},
      status: "pending",
      idempotencyKey,
    });
  } else if (row.status === "completed") {
    return { outboxId: String(row._id), queued: false, skipped: true };
  }

  const jobData = {
    orderId: String(resourceId),
    organizationId: String(orgId),
    outboxId: String(row._id),
    originatedBy: params.originatedBy || row.originatedBy || "",
    ...(params.payload || {}),
  };

  const queueResult = await addJob(QUEUE_NAME, jobName, jobData, {
    jobId: idempotencyKey,
    attempts: 5,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });

  if (queueResult.queued) {
    await AccountingIntegrationOutbox.updateOne(
      { _id: row._id },
      {
        status: "queued",
        bullJobId: String(queueResult.jobId || ""),
        $inc: { attemptCount: 1 },
        lastError: "",
      }
    );
    return {
      outboxId: String(row._id),
      queued: true,
      jobId: queueResult.jobId,
    };
  }

  await AccountingIntegrationOutbox.updateOne(
    { _id: row._id },
    {
      status: "pending",
      lastError: queueResult.reason || "no_redis",
      nextAttemptAt: new Date(Date.now() + 60_000),
    }
  );

  return {
    outboxId: String(row._id),
    queued: false,
    reason: queueResult.reason || "no_redis",
  };
}

async function markOutboxProcessing(outboxId) {
  if (!outboxId) return;
  await AccountingIntegrationOutbox.updateOne(
    { _id: outboxId, status: { $in: ["pending", "queued", "failed"] } },
    { status: "processing", lastError: "" }
  ).catch(() => {});
}

async function markOutboxCompleted(outboxId) {
  if (!outboxId) return;
  await AccountingIntegrationOutbox.updateOne(
    { _id: outboxId },
    {
      status: "completed",
      completedAt: new Date(),
      lastError: "",
      nextAttemptAt: null,
    }
  ).catch(() => {});
}

async function markOutboxFailed(outboxId, errorMessage) {
  if (!outboxId) return;
  const msg = String(errorMessage || "unknown").slice(0, 2000);
  await AccountingIntegrationOutbox.updateOne(
    { _id: outboxId },
    {
      status: "failed",
      lastError: msg,
      nextAttemptAt: new Date(Date.now() + 5 * 60_000),
      $inc: { attemptCount: 1 },
    }
  ).catch(() => {});
}

/**
 * Process pending outbox rows when Redis queue is unavailable or jobs stalled.
 * @param {object} handlers
 * @param {(job: object) => Promise<*>} handlers.sync_paid_order
 * @param {(job: object) => Promise<*>} handlers.void_receipt
 * @param {(job: object) => Promise<*>} handlers.partial_refund
 * @param {number} [limit]
 */
async function drainPendingAccountingOutbox(handlers, limit = 25) {
  const now = new Date();
  const rows = await AccountingIntegrationOutbox.find({
    status: { $in: ["pending", "failed"] },
    $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  let processed = 0;
  for (const row of rows) {
    const handler = handlers[row.eventType];
    if (!handler) continue;

    await markOutboxProcessing(String(row._id));
    const job = {
      id: row.idempotencyKey,
      name: JOB_NAME_BY_EVENT[row.eventType],
      data: {
        orderId: String(row.orderId),
        organizationId: String(row.organization),
        outboxId: String(row._id),
        originatedBy: row.originatedBy || "",
        ...(row.payload || {}),
      },
    };

    try {
      await handler(job);
      await markOutboxCompleted(String(row._id));
      processed += 1;
    } catch (err) {
      await markOutboxFailed(String(row._id), err?.message || err);
    }
  }
  return { processed, scanned: rows.length };
}

module.exports = {
  QUEUE_NAME,
  JOB_NAME_BY_EVENT,
  recordAndDispatchAccountingSync,
  markOutboxProcessing,
  markOutboxCompleted,
  markOutboxFailed,
  drainPendingAccountingOutbox,
};
