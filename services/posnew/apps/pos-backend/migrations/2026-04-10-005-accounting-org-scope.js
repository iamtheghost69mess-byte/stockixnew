/**
 * Backfill `organization` on accounting collections and re-seed sequence keys per anchor org.
 * Idempotent. Requires at least one Organization (same contract as other org backfills).
 */
const mongoose = require("mongoose");

async function resolveAnchorOrgId() {
  const Organization = require("../models/organizationModel");
  const envId = process.env.DEFAULT_ORG_ID;
  if (envId && mongoose.Types.ObjectId.isValid(String(envId))) {
    const o = await Organization.findById(envId).select("_id").lean();
    if (o) return o._id;
  }
  const first = await Organization.findOne().sort({ _id: 1 }).select("_id").lean();
  if (!first) {
    throw new Error(
      "accounting-org-scope: no Organization exists; create one before running migrations."
    );
  }
  return first._id;
}

const nullOrg = {
  $or: [{ organization: null }, { organization: { $exists: false } }],
};

async function copySequence(oldId, anchor) {
  const AccountingSequence = require("../models/accountingSequenceModel");
  const old = await AccountingSequence.findById(oldId).lean();
  if (!old || old.seq == null) return;
  const newId = `${oldId}:${String(anchor)}`;
  const exists = await AccountingSequence.findById(newId).lean();
  if (exists) return;
  await AccountingSequence.create({ _id: newId, seq: old.seq });
}

module.exports = {
  migrationId: "2026-04-10-005-accounting-org-scope",
  description:
    "Backfill organization on GL collections; copy legacy AccountingSequence counters to per-org keys.",
  async run() {
    const anchor = await resolveAnchorOrgId();
    const AccountingAccount = require("../models/accountingAccountModel");
    const JournalEntry = require("../models/journalEntryModel");
    const AccountingConfig = require("../models/accountingConfigModel");
    const AccountingSession = require("../models/accountingSessionModel");
    const JournalAuditLog = require("../models/journalAuditLogModel");
    const FxRate = require("../models/fxRateModel");
    const AccountingInvoice = require("../models/accountingInvoiceModel");
    const AccountingPeriod = require("../models/accountingPeriodModel");
    const AccountingSyncLog = require("../models/accountingSyncLogModel");

    const models = [
      AccountingAccount,
      JournalEntry,
      AccountingConfig,
      AccountingSession,
      JournalAuditLog,
      FxRate,
      AccountingInvoice,
      AccountingPeriod,
      AccountingSyncLog,
    ];
    for (const M of models) {
      const r = await M.updateMany(nullOrg, { $set: { organization: anchor } });
      if (r.modifiedCount > 0) {
        // eslint-disable-next-line no-console
        console.info(`${M.modelName}: backfilled organization on ${r.modifiedCount} docs`);
      }
    }

    await copySequence("journalEntry", anchor);
    await copySequence("accountingSession", anchor);
    await copySequence("invoiceNumber", anchor);
  },
};
