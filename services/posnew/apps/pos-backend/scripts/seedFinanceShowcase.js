/**
 * Seeds professional-looking GL activity for the anchor org (DEFAULT_ORG_ID or oldest org).
 * Idempotent via idempotencyKey on each journal — safe to re-run.
 *
 * From apps/pos-backend:
 *   npm run seed:finance-showcase
 *
 * Uses default chart codes: 1000 cash, 4000 revenue, 5000 / 5100 / 5900 expense lines.
 * Does not create vendor bills, invoices, or opening equity (keeps BS equity consistent with your GL).
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const accountingService = require("../services/accountingService");
const AccountingAccount = require("../models/accountingAccountModel");
const {
  resolveAnchorOrganizationId,
} = require("../utils/resolveAnchorOrganizationId");

const SCRIPT_ID = "seed:finance-showcase:v2026-04";

function utcMidMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex, 18, 12, 0, 0));
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Slightly different mixes per month so charts look alive (not flat). */
const MONTHLY_REVENUE = [96_400, 112_800, 108_200, 124_900, 118_600, 121_300, 126_500, 119_200, 115_400, 122_100, 128_000, 117_500];
const MONTHLY_OPEX_A = [18_200, 19_400, 18_900, 21_100, 20_200, 20_800, 21_400, 20_000, 19_600, 20_500, 21_200, 20_300];
const MONTHLY_OPEX_B = [14_500, 15_800, 15_200, 16_900, 16_100, 16_600, 17_000, 15_900, 15_400, 16_200, 16_800, 16_000];
const MONTHLY_OPEX_C = [220, 240, 230, 260, 250, 255, 265, 245, 235, 250, 260, 248];

async function main() {
  await mongoose.connect(config.databaseURI);
  const orgId = await resolveAnchorOrganizationId();
  await accountingService.ensureDefaultAccountsAndConfig(orgId);

  const byCode = async (code) => {
    const acc = await AccountingAccount.findOne({ organization: orgId, code }).lean();
    if (!acc) throw new Error(`Missing account code ${code} — run seed:accounting first.`);
    return acc._id;
  };

  const cash = await byCode("1000");
  const revenue = await byCode("4000");
  const expA = await byCode("5000");
  const expB = await byCode("5100");
  const expC = await byCode("5900");

  const year = new Date().getUTCFullYear();
  const currentMonth = new Date().getUTCMonth();

  for (let m = 0; m <= currentMonth; m += 1) {
    const rev = MONTHLY_REVENUE[m] ?? 100_000;
    const a = MONTHLY_OPEX_A[m] ?? 18_000;
    const b = MONTHLY_OPEX_B[m] ?? 15_000;
    const c = MONTHLY_OPEX_C[m] ?? 250;
    const opexTotal = round2(a + b + c);
    const dRev = utcMidMonth(year, m);
    const dOpex = new Date(Date.UTC(year, m, 22, 12, 0, 0));

    const revKey = `${SCRIPT_ID}:month-revenue:${year}-${String(m + 1).padStart(2, "0")}`;
    const r1 = await accountingService.createJournalEntry(
      {
        organization: orgId,
        entryDate: dRev,
        memo: `${SCRIPT_ID} — month ${m + 1} revenue (illustrative)`,
        sourceType: "manual",
        sourceId: null,
        companyCurrency: "USD",
        cashFlowCategory: "operating",
        lines: [
          { account: cash, debit: round2(rev), credit: 0, memo: "Cash receipts (seed)" },
          { account: revenue, debit: 0, credit: round2(rev), memo: "Revenue recognition (seed)" },
        ],
      },
      { idempotencyKey: revKey, userId: null, auditAction: "seed.finance_showcase" },
    );
    console.log(
      r1.reused ? `  ${revKey}: exists` : `  ${revKey}: created (${round2(rev)} revenue)`,
    );

    const opexKey = `${SCRIPT_ID}:month-opex:${year}-${String(m + 1).padStart(2, "0")}`;
    const r2 = await accountingService.createJournalEntry(
      {
        organization: orgId,
        entryDate: dOpex,
        memo: `${SCRIPT_ID} — month ${m + 1} operating costs (illustrative)`,
        sourceType: "manual",
        sourceId: null,
        companyCurrency: "USD",
        cashFlowCategory: "operating",
        lines: [
          { account: expA, debit: round2(a), credit: 0, memo: "Marketing & discounts (seed)" },
          { account: expB, debit: round2(b), credit: 0, memo: "COGS — inventory (seed)" },
          { account: expC, debit: round2(c), credit: 0, memo: "Cash variance (seed)" },
          { account: cash, debit: 0, credit: round2(opexTotal), memo: "Cash paid (seed)" },
        ],
      },
      { idempotencyKey: opexKey, userId: null, auditAction: "seed.finance_showcase" },
    );
    console.log(
      r2.reused ? `  ${opexKey}: exists` : `  ${opexKey}: created (opex ${opexTotal})`,
    );
  }

  await mongoose.disconnect();
  console.log("seed:finance-showcase done. Open /dashboard/finance (without ?demo=1) for live API data.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
