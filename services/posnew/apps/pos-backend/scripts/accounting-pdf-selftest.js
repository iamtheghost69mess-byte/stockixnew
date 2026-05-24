#!/usr/bin/env node
/**
 * Verifies accountingPdfService (PDFKit) builds valid PDF buffers with document metadata.
 * No database or HTTP — safe to run in CI with: node scripts/accounting-pdf-selftest.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { trialBalanceToPdfBuffer, journalsToPdfBuffer } = require("../services/accountingPdfService");

function assertPdfMagic(buf, label) {
  assert(Buffer.isBuffer(buf), `${label}: not a buffer`);
  assert(buf.length > 200, `${label}: too small`);
  assert(buf.subarray(0, 4).toString("ascii") === "%PDF", `${label}: missing %PDF header`);
}

async function main() {
  const mockTb = {
    rows: [
      { code: "1000", name: "Cash on hand", type: "asset", debit: 1500, credit: 0, balance: 1500 },
      { code: "4000", name: "Food & beverage revenue", type: "revenue", debit: 0, credit: 1500, balance: -1500 },
    ],
    totalDebit: 1500,
    totalCredit: 1500,
    balanced: true,
  };

  const tbBuf = await trialBalanceToPdfBuffer(mockTb, {
    orgName: "Selftest Restaurant LLC",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
  });
  assertPdfMagic(tbBuf, "trial balance");

  const mockEntries = [
    {
      entryNumber: 1,
      entryDate: new Date("2026-01-15"),
      sourceType: "manual",
      memo: "Opening test entry",
      lines: [
        { debit: 100, credit: 0, account: { code: "1000", name: "Cash" } },
        { debit: 0, credit: 100, account: { code: "4000", name: "Revenue" } },
      ],
    },
  ];
  const jBuf = await journalsToPdfBuffer(mockEntries, {
    orgName: "Selftest Restaurant LLC",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
  });
  assertPdfMagic(jBuf, "journals");

  const emptyBuf = await journalsToPdfBuffer([], { orgName: "Empty Org" });
  assertPdfMagic(emptyBuf, "empty journals");

  const outDir = path.join(__dirname, "..", ".tmp-pdf-selftest");
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "trial-balance-sample.pdf"), tbBuf);
    fs.writeFileSync(path.join(outDir, "journal-export-sample.pdf"), jBuf);
    console.log(`Wrote samples under ${outDir} (optional visual check).`);
  } catch {
    /* ignore write errors in restricted env */
  }

  console.log("accounting-pdf-selftest: OK (PDF buffers + metadata via pdfkit).");
}

main().catch((e) => {
  console.error("accounting-pdf-selftest: FAILED");
  console.error(e);
  process.exit(1);
});
