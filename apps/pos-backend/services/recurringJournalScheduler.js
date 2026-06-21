const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const config = require("../config/config");
const { RECURRING_JOURNAL_QUEUE } = require("../constants/recurringJournalQueue");

function attachRedisErrorLogger(connection, label) {
  let logged = false;
  connection.on("error", (err) => {
    if (!logged) {
      logged = true;
      console.warn(
        `[redis] ${label}: ${err.message}. Is Redis running? (Further connection errors are suppressed in logs.)`,
      );
    }
  });
}

async function startRecurringJournalScheduler() {
  const url = (config.redisUrl || "").trim();
  if (!url) {
    console.warn("☑️  Recurring journal scheduler skipped (no REDIS_URL).");
    return;
  }

  const connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      if (times > 15) return null;
      return Math.min(times * 200, 3000);
    },
  });
  attachRedisErrorLogger(connection, "recurring journal scheduler");

  const queue = new Queue(RECURRING_JOURNAL_QUEUE, { connection });

  try {
    await queue.add(
      "check-templates",
      {},
      {
        repeat: { pattern: "0 * * * *" },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    console.log("☑️  Recurring journal scheduler started (Hourly)");
  } catch (e) {
    console.error("Failed to start recurring journal scheduler:", e.message);
  }
}

module.exports = { startRecurringJournalScheduler };
