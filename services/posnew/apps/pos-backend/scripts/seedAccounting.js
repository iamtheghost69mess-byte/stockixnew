/**
 * Idempotent accounting seed: chart of accounts + default config + optional dummy journal.
 * Run from pos-backend: npm run seed:accounting
 *
 * Optional: SEED_ACCOUNTING_DUMMY=1 adds a balanced manual journal for API smoke tests.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const accountingService = require("../services/accountingService");
const JournalEntry = require("../models/journalEntryModel");
const {
  resolveAnchorOrganizationId,
} = require("../utils/resolveAnchorOrganizationId");

async function main() {
  await mongoose.connect(config.databaseURI);
  const orgId = await resolveAnchorOrganizationId();
  const { accounts, config: cfg } =
    await accountingService.ensureDefaultAccountsAndConfig(orgId);
  console.log("Accounting defaults OK. Config key:", cfg.key);
  console.log(
    "Accounts:",
    Object.values(accounts)
      .map((a) => `${a.code} ${a.name}`)
      .join(" | ")
  );

  if (process.env.SEED_ACCOUNTING_DUMMY === "1") {
    const cash = accounts["1000"];
    const revenue = accounts["4000"];
    const existing = await JournalEntry.countDocuments({ sourceType: "manual" });
    if (existing === 0 && cash && revenue) {
      const n = await accountingService.nextSequence("journalEntry", orgId);
      await JournalEntry.create({
        organization: orgId,
        entryNumber: n,
        entryDate: new Date(),
        memo: "Dummy seed: opening balance style check",
        sourceType: "manual",
        lines: [
          { account: cash._id, debit: 0.01, credit: 0, memo: "penny test debit" },
          { account: revenue._id, debit: 0, credit: 0.01, memo: "penny test credit" },
        ],
      });
      console.log("Dummy manual journal (0.01 balanced) created.");
    } else {
      console.log("Dummy journal skipped (manual entries already exist or missing accounts).");
    }
  }

  await mongoose.disconnect();
  console.log("seed:accounting done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
