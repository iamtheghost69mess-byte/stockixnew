const cron = require("node-cron");
const ReportSchedule = require("../models/reportScheduleModel");
const { enqueueEmail } = require("./notificationQueue");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** @type {import("node-cron").ScheduledTask | null} */
let reportCronJob = null;

function computeNextRunAt(frequency, baseDate = new Date()) {
  const normalized = String(frequency || "").toLowerCase();
  const next = new Date(baseDate);
  next.setHours(0, 0, 0, 0);
  if (normalized === "weekly") {
    next.setDate(next.getDate() + 7);
    return next;
  }
  if (normalized === "monthly") {
    next.setMonth(next.getMonth() + 1);
    return next;
  }
  next.setDate(next.getDate() + 1);
  return next;
}

async function executeSchedule(schedule) {
  const payload = {
    event: "report_schedule_run",
    scheduleId: String(schedule._id),
    reportType: schedule.reportType,
    frequency: schedule.frequency,
    organizationId: String(schedule.organization),
    locationId: schedule.location ? String(schedule.location) : null,
    generatedAt: new Date().toISOString(),
  };
  if (schedule.webhookUrl) {
    await fetch(schedule.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
  const recipients = Array.isArray(schedule.recipients) ? schedule.recipients : [];
  const emails = recipients
    .map((r) => String(r || "").trim())
    .filter((r) => r.includes("@"));
  if (emails.length === 0) return;
  const subject = `[Scheduled report] ${schedule.name || schedule.reportType}`;
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;font-size:14px;color:#222">
<p><strong>${subject}</strong></p>
<p>Report type: <code>${String(schedule.reportType || "").replace(/</g, "")}</code></p>
<p>Frequency: <code>${String(schedule.frequency || "").replace(/</g, "")}</code></p>
<p>Branch: ${payload.locationId || "all / org default"}</p>
<p>Payload (JSON):</p>
<pre style="background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto">${JSON.stringify(
    payload,
    null,
    2
  )}</pre>
<p>Use the back office <strong>Reports</strong> area to export PDF/Excel for the full dataset. This email is a delivery receipt and schedule trigger log.</p>
</body></html>`;
  for (const to of emails) {
    try {
      await enqueueEmail({ to, subject, html });
    } catch (err) {
      console.error(
        "[report-schedule] email enqueue failed:",
        to,
        err?.message || err
      );
    }
  }
}

async function tickReportSchedules() {
  const now = new Date();
  const due = await ReportSchedule.find({
    isActive: true,
    nextRunAt: { $lte: now },
  }).limit(50);
  for (const schedule of due) {
    await executeSchedule(schedule);
    schedule.lastRunAt = now;
    schedule.nextRunAt = computeNextRunAt(schedule.frequency, now);
    await schedule.save();
  }
}

function millisUntilNextMidnight(baseDate = new Date()) {
  const next = new Date(baseDate);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - baseDate.getTime());
}

function startReportScheduleService() {
  if (reportCronJob) return;
  reportCronJob = cron.schedule(
    "0 0 * * *",
    () => {
      tickReportSchedules().catch((error) => {
        console.error("[report-schedule] cron tick failed:", error?.message || error);
      });
    },
    { timezone: process.env.REPORT_SCHEDULE_TZ || "UTC" }
  );
  tickReportSchedules().catch((error) => {
    console.error("[report-schedule] initial tick failed:", error?.message || error);
  });
}

function stopReportScheduleService() {
  if (reportCronJob) {
    reportCronJob.stop();
    reportCronJob = null;
  }
}

module.exports = {
  ONE_DAY_MS,
  computeNextRunAt,
  millisUntilNextMidnight,
  tickReportSchedules,
  startReportScheduleService,
  stopReportScheduleService,
};
