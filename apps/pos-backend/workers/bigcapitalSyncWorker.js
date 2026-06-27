/**
 * BullMQ worker — run: `npm run worker:bigcapital`
 */
const path = require("path");
const { loadEnvIfDev } = require("../lib/load-env-if-dev");
loadEnvIfDev({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
const connectDB = require("../config/database");
const { createWorker } = require("../services/jobQueue");
const {
  processBigcapitalSyncJob,
  processBigcapitalVoidJob,
  processBigcapitalPartialRefundJob,
  onBigcapitalSyncFailed,
} = require("../services/bigcapitalSyncProcessor");
const {
  processGrnBillJob,
  processInventoryAdjustJob,
  processStockTakeVarianceJob,
} = require("../services/bigcapitalInventorySync");
const {
  markOutboxProcessing,
  markOutboxCompleted,
  markOutboxFailed,
  drainPendingAccountingOutbox,
  countStuckOutboxRows,
} = require("../services/accountingIntegrationOutbox");
const AccountingIntegrationOutbox = require("../models/accountingIntegrationOutboxModel");
const {
  NOTIFICATION_EVENTS,
  createBackofficeNotificationFromEvent,
} = require("../services/backofficeNotificationEvents");

const QUEUE_NAME = "bigcapital_sync";
const OUTBOX_DRAIN_MS = Number(process.env.ACCOUNTING_OUTBOX_DRAIN_MS || 45_000);
const STUCK_CHECK_MS = Number(process.env.ACCOUNTING_STUCK_CHECK_MS || 15 * 60_000);

async function runWithOutbox(job, handler) {
  const outboxId = job?.data?.outboxId;
  if (outboxId) await markOutboxProcessing(outboxId);
  try {
    const result = await handler(job);
    if (outboxId) await markOutboxCompleted(outboxId);
    return result;
  } catch (err) {
    if (outboxId) await markOutboxFailed(outboxId, err?.message || err);
    throw err;
  }
}

async function main() {
  await connectDB();

  const handlers = {
    sync_paid_order: (job) => runWithOutbox(job, processBigcapitalSyncJob),
    void_receipt: (job) => runWithOutbox(job, processBigcapitalVoidJob),
    partial_refund: (job) => runWithOutbox(job, processBigcapitalPartialRefundJob),
    grn_bill: (job) =>
      runWithOutbox(job, (j) =>
        processGrnBillJob({
          data: {
            grnId: j.data.grnId || j.data.orderId,
            organizationId: j.data.organizationId,
          },
        })
      ),
    inventory_adjustment: (job) => runWithOutbox(job, processInventoryAdjustJob),
    stock_take_variance: (job) =>
      runWithOutbox(job, (j) =>
        processStockTakeVarianceJob({
          data: {
            stockTakeSessionId:
              j.data.stockTakeSessionId || j.data.orderId,
            organizationId: j.data.organizationId,
          },
        })
      ),
  };

  const worker = createWorker(QUEUE_NAME, async (job) => {
    const handler = handlers[job.name] || handlers.sync_paid_order;
    return handler(job);
  });

  if (!worker) {
    console.error(
      "[BigcapitalSync] Worker not started — Redis unavailable or bullmq missing"
    );
    process.exit(1);
  }

  worker.on("completed", (job, result) => {
    if (!result?.skipped) {
      console.log("[BigcapitalSync] Job completed:", job.id, result);
    }
  });

  worker.on("failed", (job, err) => {
    onBigcapitalSyncFailed(job, err);
  });

  const drainOutbox = async () => {
    try {
      const { processed, scanned } = await drainPendingAccountingOutbox(
        handlers,
        25
      );
      if (processed > 0) {
        console.log(
          `[BigcapitalSync] Outbox drain processed=${processed} scanned=${scanned}`
        );
      }
    } catch (err) {
      console.error("[BigcapitalSync] Outbox drain error:", err?.message || err);
    }
  };

  setInterval(drainOutbox, OUTBOX_DRAIN_MS);
  void drainOutbox();

  const alertStuckOrgs = async () => {
    try {
      const stuckOrgIds = await AccountingIntegrationOutbox.distinct("organization", {
        status: "failed",
        updatedAt: { $lt: new Date(Date.now() - 30 * 60_000) },
      });
      for (const orgId of stuckOrgIds) {
        const count = await countStuckOutboxRows(orgId);
        if (count <= 0) continue;
        await createBackofficeNotificationFromEvent(
          NOTIFICATION_EVENTS.ACCOUNTING_SYNC_STUCK,
          { organizationId: String(orgId), stuckCount: count },
        ).catch(() => {});
      }
    } catch (err) {
      console.error("[BigcapitalSync] Stuck check error:", err?.message || err);
    }
  };

  const stuckTimer = setInterval(alertStuckOrgs, STUCK_CHECK_MS);
  if (stuckTimer.unref) stuckTimer.unref();
  void alertStuckOrgs();

  console.log("[BigcapitalSync] Worker started on queue:", QUEUE_NAME);
}

main().catch((err) => {
  console.error("[BigcapitalSync] Fatal:", err);
  process.exit(1);
});
