/**
 * BullMQ worker — run: `npm run worker:bigcapital`
 */
require("dotenv").config();
const connectDB = require("../config/database");
const { createWorker } = require("../services/jobQueue");
const {
  processBigcapitalSyncJob,
  onBigcapitalSyncFailed,
} = require("../services/bigcapitalSyncProcessor");

const QUEUE_NAME = "bigcapital_sync";

async function main() {
  await connectDB();

  const worker = createWorker(QUEUE_NAME, async (job) =>
    processBigcapitalSyncJob(job)
  );

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

  console.log("[BigcapitalSync] Worker started on queue:", QUEUE_NAME);
}

main().catch((err) => {
  console.error("[BigcapitalSync] Fatal:", err);
  process.exit(1);
});
