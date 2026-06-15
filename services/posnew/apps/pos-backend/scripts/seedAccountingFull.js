/**
 * Rich dummy data for accounting QA: sync log, manual JE, optional FX row.
 * Idempotent where possible. Run: npm run seed:accounting:full
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const accountingService = require("../services/accountingService");
const AccountingSyncLog = require("../models/accountingSyncLogModel");
const AccountingAccount = require("../models/accountingAccountModel");
const FxRate = require("../models/fxRateModel");
const {
  resolveAnchorOrganizationId,
} = require("../utils/resolveAnchorOrganizationId");

async function main() {
  await mongoose.connect(config.databaseURI);
  const orgId = await resolveAnchorOrganizationId();
  await accountingService.ensureDefaultAccountsAndConfig(orgId);

  const cash = await AccountingAccount.findOne({
    organization: orgId,
    code: "1000",
  });
  const rev = await AccountingAccount.findOne({
    organization: orgId,
    code: "4000",
  });

  const cfg = await accountingService.getConfig(orgId);
  const comp = cfg.companyCurrency || "USD";

  const fxExists = await FxRate.findOne({
    organization: orgId,
    fromCurrency: "EUR",
    toCurrency: comp,
  });
  if (!fxExists) {
    await FxRate.create({
      organization: orgId,
      effectiveDate: new Date(),
      fromCurrency: "EUR",
      toCurrency: comp,
      rate: 1.08,
      note: "Seed illustrative rate (replace in production)",
    });
    console.log("Created sample FX rate EUR →", comp);
  } else {
    console.log("FX rate EUR sample already present.");
  }

  const batchId = "seed-offline-batch-1";
  if (
    !(await AccountingSyncLog.findOne({
      organization: orgId,
      batchId,
    }))
  ) {
    await AccountingSyncLog.create({
      organization: orgId,
      batchId,
      orderIds: [],
      note: "Placeholder sync ack from seed",
    });
    console.log("Created sync log:", batchId);
  }

  await accountingService.createJournalEntry(
    {
      organization: orgId,
      memo: "Seed opening check — balanced penny",
      sourceType: "manual",
      sourceId: null,
      companyCurrency: "USD",
      lines: [
        { account: cash._id, debit: 0.02, credit: 0, memo: "seed" },
        { account: rev._id, debit: 0, credit: 0.02, memo: "seed" },
      ],
    },
    { idempotencyKey: "seed:opening-penny", userId: null, auditAction: "seed" }
  );
  console.log("Ensured seed manual journal (idempotent key).");

  await mongoose.disconnect();
  console.log("seed:accounting:full done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
