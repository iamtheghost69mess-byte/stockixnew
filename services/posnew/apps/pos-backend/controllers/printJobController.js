const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const PrintJob = require("../models/printJobModel");
const { addJob, retryFailedJob } = require("../services/jobQueue");

const listPrintJobs = async (req, res, next) => {
  try {
    const q = {};
    if (req.tenantOrganizationId) q.org = req.tenantOrganizationId;
    if (req.query.printerId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.printerId)) {
        return next(createHttpError(400, "Invalid printerId."));
      }
      q.printer = req.query.printerId;
    }
    if (req.query.status) {
      q.status = String(req.query.status).toLowerCase();
    }
    const docs = await PrintJob.find(q).sort({ createdAt: -1 }).limit(200);
    res.status(200).json({ success: true, data: docs });
  } catch (e) {
    next(e);
  }
};

const getPrintJobById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid print job id."));
    }
    const q = { _id: id };
    if (req.tenantOrganizationId) q.org = req.tenantOrganizationId;
    const doc = await PrintJob.findOne(q);
    if (!doc) return next(createHttpError(404, "Print job not found."));
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const ackPrintJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid print job id."));
    }
    const q = { _id: id };
    if (req.tenantOrganizationId) q.org = req.tenantOrganizationId;
    const doc = await PrintJob.findOne(q);
    if (!doc) return next(createHttpError(404, "Print job not found."));

    const status = String(req.body?.status || "").toLowerCase();
    if (status !== "done" && status !== "failed") {
      return next(createHttpError(400, "status must be done or failed."));
    }
    const alreadyTerminal = doc.status === "done" || doc.status === "failed";
    if (alreadyTerminal && doc.status === status) {
      return res.status(200).json({ success: true, data: doc, idempotent: true });
    }
    if (alreadyTerminal && doc.status !== status) {
      return next(
        createHttpError(
          409,
          `Print job already finalized as '${doc.status}'. Refusing conflicting ack '${status}'.`
        )
      );
    }
    doc.status = status;
    doc.lastError =
      status === "failed"
        ? req.body?.error
          ? String(req.body.error)
          : "Terminal reported print failure."
        : "";
    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const retryPrintJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid print job id."));
    }
    const q = { _id: id };
    if (req.tenantOrganizationId) q.org = req.tenantOrganizationId;
    const doc = await PrintJob.findOne(q);
    if (!doc) return next(createHttpError(404, "Print job not found."));
    if (doc.status !== "failed") {
      return next(createHttpError(400, "Only failed jobs can be retried."));
    }

    let queueRes = null;
    if (doc.printerType === "usb" && doc.queueJobId) {
      queueRes = await retryFailedJob("print-jobs", doc.queueJobId);
    }
    if (!queueRes || !queueRes.ok) {
      const enq = await addJob(
        "print-jobs",
        doc.printerType === "usb" ? "usb_dispatch" : "re_dispatch",
        { printJobId: String(doc._id) },
        { attempts: 3, backoff: { type: "printExp" } }
      );
      if (!enq.queued) {
        return next(createHttpError(503, "Queue unavailable. Retry later."));
      }
      doc.queueJobId = String(enq.jobId || "");
    }

    doc.status = "pending";
    doc.lastError = "";
    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listPrintJobs,
  getPrintJobById,
  ackPrintJob,
  retryPrintJob,
};
