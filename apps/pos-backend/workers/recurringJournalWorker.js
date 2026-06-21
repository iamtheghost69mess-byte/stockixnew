const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const IORedis = require("ioredis");
const config = require("../config/config");
const { RECURRING_JOURNAL_QUEUE } = require("../constants/recurringJournalQueue");
const RecurringJournalTemplate = require("../models/recurringJournalTemplateModel");
const Organization = require("../models/organizationModel");
const accountingService = require("../services/accountingService");
const {
  resolveOrganizationAccessState,
  logWorkerSkipDueToBlockedOrg,
} = require("../services/organizationAccessService");

function attachRedisErrorLogger(connection, label) {
  let logged = false;
  connection.on("error", (err) => {
    if (!logged) {
      logged = true;
      console.warn(`[redis] ${label}: ${err.message}. (Further errors suppressed.)`);
    }
  });
}

async function processRecurringJournals() {
  const now = new Date();
  const templates = await RecurringJournalTemplate.find({
    isActive: true,
    nextRunAt: { $lte: now },
  });

  console.log(`[worker] Processing ${templates.length} recurring journal templates...`);

  for (const t of templates) {
    try {
      const org = await Organization.findById(t.organization)
        .select("timezone licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt")
        .lean();
      if (!org) {
        console.warn(`[worker] Skipping recurring journal ${t._id}: organization not found.`);
        continue;
      }
      const accessState = await resolveOrganizationAccessState(t.organization, org, {
        routeKey: "worker.recurring-journal",
        useCache: true,
      });
      if (accessState.blocked) {
        await logWorkerSkipDueToBlockedOrg(t.organization, accessState, {
          workerName: "recurringJournalWorker",
        });
        console.warn(`[worker] Skipping recurring journal ${t._id}: ${accessState.reason}`);
        continue;
      }
      await accountingService.createJournalEntry(
        {
          organization: t.organization,
          entryDate: now,
          memo: t.memo,
          sourceType: "manual",
          lines: t.templateLines,
        },
        { auditAction: "gl.recurring_post" },
      );

      const next = new Date(t.nextRunAt);
      if (t.frequency === "daily") next.setDate(next.getDate() + 1);
      else if (t.frequency === "weekly") next.setDate(next.getDate() + 7);
      else if (t.frequency === "monthly") next.setMonth(next.getMonth() + 1);

      t.lastRunAt = now;
      t.nextRunAt = next;
      await t.save();

      console.log(`[worker] Posted recurring journal for template ${t._id}`);
    } catch (e) {
      console.error(`[worker] Failed to post recurring journal ${t._id}:`, e.message);
    }
  }
}

function startWorker() {
  const url = (config.redisUrl || "").trim();
  if (!url) {
    console.error("[recurring-journal-worker] REDIS_URL is required.");
    process.exit(1);
  }

  const connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      if (times > 15) return null;
      return Math.min(times * 200, 3000);
    },
  });
  attachRedisErrorLogger(connection, "recurring journal worker");

  const worker = new Worker(
    RECURRING_JOURNAL_QUEUE,
    async (job) => {
      if (job.name === "check-templates") {
        await processRecurringJournals();
      }
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job.id} failed:`, err.message);
  });
}

if (require.main === module) {
  const { loadEnvIfDev } = require("../lib/load-env-if-dev");
  loadEnvIfDev();
  const connectDB = require("../config/database");
  (async () => {
    await connectDB();
    startWorker();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { startWorker, RECURRING_JOURNAL_QUEUE };
