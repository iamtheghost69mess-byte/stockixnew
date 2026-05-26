import { Queue, Worker } from "bullmq";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import {
  runLicenseExpiryMilestoneJob,
  type LicenseMilestoneJob,
} from "./license-expiry-milestone.js";

const QUEUE_NAME = "license-expiry-milestones";

type MilestoneJobData = LicenseMilestoneJob;

let queue: Queue<MilestoneJobData> | null = null;

function redisConnection() {
  const url = process.env.CONTROL_PLANE_REDIS_URL?.trim();
  if (!url) return null;
  return { url };
}

export function isLicenseExpiryQueueEnabled(): boolean {
  return Boolean(redisConnection());
}

export function getLicenseExpiryQueue(): Queue<MilestoneJobData> | null {
  const conn = redisConnection();
  if (!conn) return null;
  if (!queue) {
    queue = new Queue<MilestoneJobData>(QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
      },
    });
  }
  return queue;
}

export async function enqueueLicenseExpiryMilestone(
  data: MilestoneJobData,
): Promise<"queued" | "inline"> {
  const q = getLicenseExpiryQueue();
  const jobId = `${data.licenseId}:${data.milestoneDays}`;
  if (q) {
    await q.add("milestone", data, { jobId });
    return "queued";
  }
  return "inline";
}

export function startLicenseExpiryWorker(
  db: PostgresJsDatabase<typeof schema>,
  log: (message: string) => void = console.log,
): Worker<MilestoneJobData> | null {
  const conn = redisConnection();
  if (!conn) return null;

  return new Worker<MilestoneJobData>(
    QUEUE_NAME,
    async (job) => {
      await runLicenseExpiryMilestoneJob(db, job.data, log);
    },
    { connection: conn, concurrency: 2 },
  );
}
