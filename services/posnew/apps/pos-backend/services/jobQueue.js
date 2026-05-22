const config = require("../config/config");

let connection;
let Queue;
let Worker;
let queues = {};

function loadBullMq() {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const bm = require("bullmq");
    Queue = bm.Queue;
    Worker = bm.Worker;
    return true;
  } catch {
    return false;
  }
}

function getConnection() {
  if (!config.redisUrl) return null;
  if (connection) return connection;
  const ok = loadBullMq();
  if (!ok) {
    console.warn("bullmq not installed; job queues disabled.");
    return null;
  }
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const IORedis = require("ioredis");
  connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      if (times > 15) return null;
      return Math.min(times * 200, 3000);
    },
  });
  let redisErrLogged = false;
  connection.on("error", (err) => {
    if (!redisErrLogged) {
      redisErrLogged = true;
      console.warn(
        `[redis] jobQueue: ${err.message}. Is Redis running? (Further errors suppressed.)`,
      );
    }
  });
  return connection;
}

const QUEUE_NAMES = [
  "provisioning",
  "webhooks_out",
  "email",
  "exports",
  "compliance",
  "analytics_rollups",
  "fraud_review",
  "print-jobs",
];

function getQueue(name) {
  const conn = getConnection();
  if (!conn) return null;
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: conn,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    });
  }
  return queues[name];
}

async function addJob(queueName, jobName, data, opts = {}) {
  const q = getQueue(queueName);
  if (!q) {
    return { queued: false, jobId: null, reason: "no_redis" };
  }
  const job = await q.add(jobName, data, opts);
  return { queued: true, jobId: job.id, queue: queueName };
}

async function getJobStatus(queueName, jobId) {
  const q = getQueue(queueName);
  if (!q) return null;
  const job = await q.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  return {
    id: job.id,
    name: job.name,
    state,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    returnvalue: job.returnvalue,
    data: job.data,
  };
}

async function retryFailedJob(queueName, jobId) {
  const q = getQueue(queueName);
  if (!q) return { ok: false, reason: "no_redis" };
  const job = await q.getJob(jobId);
  if (!job) return { ok: false, reason: "not_found" };
  const state = await job.getState();
  if (state !== "failed") {
    return { ok: false, reason: `invalid_state:${state}` };
  }
  await job.retry();
  return { ok: true };
}

function createWorker(queueName, processor) {
  const conn = getConnection();
  if (!conn || !Worker) return null;
  return new Worker(queueName, processor, { connection: conn });
}

async function listAllJobs(filters = {}) {
  const limit = Math.max(1, Math.min(200, parseInt(filters.limit, 10) || 50));
  const offset = Math.max(0, parseInt(filters.offset, 10) || 0);
  const queue = filters.queue;
  const status = filters.status ? filters.status.toLowerCase() : 'all';

  const queuesToScan = queue && QUEUE_NAMES.includes(queue) ? [queue] : QUEUE_NAMES;
  
  const statusesToFetch = status && status !== 'all' 
    ? [status] 
    : ['active', 'waiting', 'delayed', 'failed', 'completed'];

  let allJobs = [];

  if (queue && QUEUE_NAMES.includes(queue)) {
    const q = getQueue(queue);
    if (q) {
      const jobs = await q.getJobs(statusesToFetch, offset, offset + limit - 1);
      const rows = await Promise.all(
        jobs
          .filter(Boolean)
          .map(async (job) => ({
            id: job.id,
            name: job.name,
            queue,
            state: await job.getState(),
            attemptsMade: job.attemptsMade,
            failedReason: job.failedReason,
            timestamp: job.timestamp,
          }))
      );
      allJobs = rows;
    }
  } else {
    const perQueueFetch = Math.max(limit * 2, 50);
    for (const qName of queuesToScan) {
      const q = getQueue(qName);
      if (!q) continue;
      const jobs = await q.getJobs(statusesToFetch, 0, perQueueFetch - 1);
      for (const job of jobs) {
        if (!job) continue;
        allJobs.push({
          id: job.id,
          name: job.name,
          queue: qName,
          state: null,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason,
          timestamp: job.timestamp,
          jobRef: job,
        });
      }
    }
    allJobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    allJobs = allJobs.slice(offset, offset + limit);
    const resolvedStates = await Promise.all(
      allJobs.map(async (row) => ({
        ...row,
        state: row.jobRef ? await row.jobRef.getState() : null,
      }))
    );
    allJobs = resolvedStates;
  }

  const paginated = allJobs.map((row) => ({
    id: row.id,
    name: row.name,
    queue: row.queue,
    state: row.state,
    attemptsMade: row.attemptsMade,
    failedReason: row.failedReason,
    timestamp: row.timestamp,
  }));

  return {
    jobs: paginated,
    metadata: {
      offset,
      limit,
      approximateTotalFetched: paginated.length,
    }
  };
}

module.exports = {
  QUEUE_NAMES,
  getQueue,
  getConnection,
  addJob,
  getJobStatus,
  retryFailedJob,
  createWorker,
  listAllJobs,
};
