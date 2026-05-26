/**
 * BullMQ worker — run: `npm run worker:bigcapital`
 */
require("dotenv").config();
const connectDB = require("../config/database");
const { createWorker } = require("../services/jobQueue");
const {
  processBigcapitalSyncJob,
  processBigcapitalVoidJob,
  processBigcapitalPartialRefundJob,
  onBigcapitalSyncFailed,
} = require("../services/bigcapitalSyncProcessor");
const {
  markOutboxProcessing,
  markOutboxCompleted,
  markOutboxFailed,
  drainPendingAccountingOutbox,
} = require("../services/accountingIntegrationOutbox");

const QUEUE_NAME = "bigcapital_sync";
const OUTBOX_DRAIN_MS = Number(process.env.ACCOUNTING_OUTBOX_DRAIN_MS || 45_000);

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

  console.log("[BigcapitalSync] Worker started on queue:", QUEUE_NAME);
}

main().catch((err) => {
  console.error("[BigcapitalSync] Fatal:", err);
  process.exit(1);
});
