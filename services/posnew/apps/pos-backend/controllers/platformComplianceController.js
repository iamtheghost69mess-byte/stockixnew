const createHttpError = require("http-errors");
const Organization = require("../models/organizationModel");
const { addJob } = require("../services/jobQueue");
const { writeAudit, auditFromRequest } = require("../services/platformAuditService");

const requestExport = async (req, res, next) => {
  try {
    const { organizationId } = req.body || {};
    if (!organizationId) {
      return next(createHttpError(400, "organizationId required."));
    }
    const org = await Organization.findById(organizationId);
    if (!org) return next(createHttpError(404, "Organization not found."));
    org.exportRequestedAt = new Date();
    await org.save();
    const job = await addJob("exports", "org_export_zip", {
      organizationId: String(organizationId),
    });
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.compliance.export_requested",
      organization: organizationId,
      metadata: job.jobId ? { jobId: String(job.jobId), queue: job.queue } : {},
    });
    res.json({
      success: true,
      queued: Boolean(job.queued),
      jobId: job.jobId ? String(job.jobId) : null,
      queue: job.queue || "exports",
      reason: job.reason || undefined,
    });
  } catch (e) {
    next(e);
  }
};

const requestDeletion = async (req, res, next) => {
  try {
    const { organizationId, cooldownHours } = req.body || {};
    if (!organizationId) {
      return next(createHttpError(400, "organizationId required."));
    }
    const org = await Organization.findById(organizationId);
    if (!org) return next(createHttpError(404, "Organization not found."));
    org.deletionRequestedAt = new Date();
    const hours = Number(cooldownHours || 72);
    org.deletionScheduledAt = new Date(Date.now() + hours * 3600_000);
    org.lifecycle = "pending_closure";
    await org.save();
    const job = await addJob("compliance", "org_erasure", {
      organizationId: String(organizationId),
      runAfter: org.deletionScheduledAt.toISOString(),
    });
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.compliance.deletion_scheduled",
      organization: organizationId,
      metadata: {
        deletionScheduledAt: org.deletionScheduledAt,
        jobId: job.jobId ? String(job.jobId) : null,
      },
    });
    res.json({
      success: true,
      queued: Boolean(job.queued),
      jobId: job.jobId ? String(job.jobId) : null,
      queue: job.queue || "compliance",
      reason: job.reason || undefined,
      data: org,
    });
  } catch (e) {
    next(e);
  }
};

module.exports = { requestExport, requestDeletion };
