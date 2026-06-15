const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const ReportSchedule = require("../models/reportScheduleModel");
const { assertTenantOrganization } = require("../utils/tenantOrg");
const { computeNextRunAt } = require("../services/reportScheduleService");

async function listReportSchedules(req, res, next) {
  try {
    const organizationId = assertTenantOrganization(req);
    const rows = await ReportSchedule.find({
      organization: organizationId,
      ...(req.locationScopeId ? { location: req.locationScopeId } : {}),
    })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
}

async function createReportSchedule(req, res, next) {
  try {
    const organizationId = assertTenantOrganization(req);
    const { name, reportType, frequency, recipients, webhookUrl } = req.body || {};
    if (!name || !reportType || !frequency) {
      return next(createHttpError(400, "name, reportType, and frequency are required."));
    }
    const created = await ReportSchedule.create({
      organization: organizationId,
      location: req.locationScopeId || null,
      name: String(name).trim(),
      reportType: String(reportType),
      frequency: String(frequency),
      recipients: Array.isArray(recipients) ? recipients.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
      webhookUrl: String(webhookUrl || "").trim(),
      isActive: true,
      nextRunAt: computeNextRunAt(frequency, new Date()),
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
}

async function updateReportSchedule(req, res, next) {
  try {
    const organizationId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
      return next(createHttpError(400, "Invalid schedule id."));
    }
    const payload = { ...req.body };
    if (payload.frequency) {
      payload.nextRunAt = computeNextRunAt(payload.frequency, new Date());
    }
    const updated = await ReportSchedule.findOneAndUpdate(
      { _id: id, organization: organizationId, ...(req.locationScopeId ? { location: req.locationScopeId } : {}) },
      payload,
      { new: true }
    );
    if (!updated) return next(createHttpError(404, "Schedule not found."));
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

async function deleteReportSchedule(req, res, next) {
  try {
    const organizationId = assertTenantOrganization(req);
    const { id } = req.params;
    const deleted = await ReportSchedule.findOneAndDelete({
      _id: id,
      organization: organizationId,
      ...(req.locationScopeId ? { location: req.locationScopeId } : {}),
    });
    if (!deleted) return next(createHttpError(404, "Schedule not found."));
    res.status(200).json({ success: true, data: { deletedId: id } });
  } catch (error) {
    next(error);
  }
}

async function testSendReportSchedule(req, res, next) {
  try {
    const organizationId = assertTenantOrganization(req);
    const { id } = req.params;
    const schedule = await ReportSchedule.findOne({
      _id: id,
      organization: organizationId,
      ...(req.locationScopeId ? { location: req.locationScopeId } : {}),
    });
    if (!schedule) return next(createHttpError(404, "Schedule not found."));
    if (!schedule.webhookUrl) {
      return next(createHttpError(400, "Schedule webhookUrl is required for test-send."));
    }
    await fetch(schedule.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "report_schedule_test_send",
        scheduleId: String(schedule._id),
        reportType: schedule.reportType,
        sentAt: new Date().toISOString(),
      }),
    });
    res.status(200).json({ success: true, data: { tested: true } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listReportSchedules,
  createReportSchedule,
  updateReportSchedule,
  deleteReportSchedule,
  testSendReportSchedule,
};
