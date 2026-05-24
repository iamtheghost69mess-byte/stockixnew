const createHttpError = require("http-errors");
const {
  getJobStatus,
  retryFailedJob,
  QUEUE_NAMES,
  listAllJobs,
} = require("../services/jobQueue");
const { writeAudit, auditFromRequest } = require("../services/platformAuditService");

const jobStatus = async (req, res, next) => {
  try {
    const { queue, id } = req.params;
    if (!QUEUE_NAMES.includes(queue)) {
      return next(createHttpError(400, "Unknown queue."));
    }
    const status = await getJobStatus(queue, id);
    if (!status) return next(createHttpError(404, "Job not found."));
    res.json({ success: true, data: status });
  } catch (e) {
    next(e);
  }
};

const retryJob = async (req, res, next) => {
  try {
    const { queue, id } = req.params;
    if (!QUEUE_NAMES.includes(queue)) {
      return next(createHttpError(400, "Unknown queue."));
    }
    const r = await retryFailedJob(queue, id);
    if (!r.ok) {
      if (r.reason === "not_found") {
        return next(createHttpError(404, "Job not found."));
      }
      if (r.reason === "no_redis") {
        return next(createHttpError(503, "Job queue unavailable."));
      }
      return next(createHttpError(400, r.reason || "Cannot retry job."));
    }
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.job.retry",
      metadata: { queue, jobId: id },
    });
    res.json({ success: true, data: { queue, id, retried: true } });
  } catch (e) {
    next(e);
  }
};

const listJobs = async (req, res, next) => {
  try {
    const result = await listAllJobs(req.query);
    res.json({ success: true, data: result.jobs, metadata: result.metadata });
  } catch (e) {
    if (e.message && e.message.includes("redis")) {
      return next(createHttpError(503, "Job queue unavailable."));
    }
    next(e);
  }
};

module.exports = { jobStatus, retryJob, listJobs };
