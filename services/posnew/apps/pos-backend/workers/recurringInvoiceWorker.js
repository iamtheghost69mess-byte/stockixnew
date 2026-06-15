const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const config = require("../config/config");
const RecurringInvoiceTemplate = require("../models/recurringInvoiceTemplateModel");
const Organization = require("../models/organizationModel");
const accountingService = require("../services/accountingService");
const {
  resolveOrganizationAccessState,
  logWorkerSkipDueToBlockedOrg,
} = require("../services/organizationAccessService");

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

const RECURRING_INVOICE_QUEUE = "recurring-invoice-queue";

async function processRecurringInvoices() {
  const now = new Date();
  const templates = await RecurringInvoiceTemplate.find({
    isActive: true,
    $and: [
      { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
      { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
    ],
    nextIssueAt: { $lte: now },
  });

  console.log(`[worker] Processing ${templates.length} recurring invoice templates...`);

  for (const t of templates) {
    try {
      const org = await Organization.findById(t.organization)
        .select("timezone licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt")
        .lean();
      if (!org) {
        console.warn(`[worker] Skipping recurring invoice ${t._id}: organization not found.`);
        continue;
      }
      const accessState = await resolveOrganizationAccessState(t.organization, org, {
        routeKey: "worker.recurring-invoice",
        useCache: true,
      });
      if (accessState.blocked) {
        await logWorkerSkipDueToBlockedOrg(t.organization, accessState, {
          workerName: "recurringInvoiceWorker",
        });
        console.warn(`[worker] Skipping recurring invoice ${t._id}: ${accessState.reason}`);
        continue;
      }
      await accountingService.issueInvoiceFromTemplate(t._id, null, { trigger: "worker" });
      console.log(`[worker] Issued recurring invoice for template ${t._id}`);
    } catch (e) {
      console.error(`[worker] Failed to issue recurring invoice ${t._id}:`, e.message);
    }
  }
}

const worker = new Worker(
  RECURRING_INVOICE_QUEUE,
  async (job) => {
    if (job.name === "check-templates") {
      await processRecurringInvoices();
    }
  },
  { connection }
);

worker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job.id} failed:`, err.message);
});

module.exports = { worker, RECURRING_INVOICE_QUEUE };
