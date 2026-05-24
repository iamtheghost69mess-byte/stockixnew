#!/usr/bin/env node
/**
 * Zerowix QA checklist — static re-verification of files and patterns referenced in todo.md.
 * Does not replace unit tests or HTTP E2E; catches accidental deletions / regressions in wiring.
 *
 * Usage (from repo root):
 *   node scripts/zerowix-qa-checklist-selftest.js
 *   node scripts/zerowix-qa-checklist-selftest.js --skip-tsc   # faster: skip frontend typecheck
 *
 * Env:
 *   MONGODB_URI / MONGO_URL — forwarded to order-lifecycle-selftest when that script runs.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");

/**
 * @param {string} relPath
 * @returns {string}
 */
function readText(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

/**
 * @param {string} relPath
 * @returns {boolean}
 */
function fileExists(relPath) {
  return fs.existsSync(path.join(REPO_ROOT, relPath));
}

/**
 * @param {boolean} condition
 * @param {string} message
 * @returns {void}
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** @typedef {{ id: string; name: string; run: () => void }} QaCheck */

/** @type {QaCheck[]} */
const checks = [];

/**
 * @param {string} id
 * @param {string} name
 * @param {() => void} run
 */
function addCheck(id, name, run) {
  checks.push({ id, name, run });
}

addCheck("meta", "todo.md has 51 DONE verdict rows in the index table", () => {
  const md = readText("todo.md");
  const matches = [...md.matchAll(/^\|\s*\[(?:\d+|V\d+)\]\s*\|\s*✅\s*\|/gm)];
  assert(matches.length === 51, `expected 51 DONE rows in verdict table, got ${matches.length}`);
});

addCheck("5", "inventorySettingsService forces stockDeductTrigger payment at runtime", () => {
  const src = readText("apps/pos-backend/services/inventorySettingsService.js");
  assert(src.includes('const stockDeductTrigger = "payment"'), "missing forced payment trigger");
});

addCheck("5-mig", "stock-deduct payment-only migration exists and is registered", () => {
  const mig = "apps/pos-backend/migrations/2026-04-28-006-stock-deduct-payment-only.js";
  assert(fileExists(mig), `missing ${mig}`);
  const reg = readText("apps/pos-backend/migrations/registry.js");
  assert(reg.includes("2026-04-28-006-stock-deduct-payment-only"), "migration not in registry.js");
});

addCheck("5-patch", "accounting PATCH normalizes stockDeductTrigger to payment", () => {
  const src = readText("apps/pos-backend/controllers/accountingController.js");
  assert(src.includes("if (b.stockDeductTrigger !== undefined)"), "stockDeductTrigger patch block missing");
  assert(src.includes('cfg.stockDeductTrigger = "payment"'), "stockDeductTrigger must normalize to payment");
});

addCheck("2", "orderController defines releaseTableByOrderId and kitchen workflow helper", () => {
  const src = readText("apps/pos-backend/controllers/orderController.js");
  assert(src.includes("releaseTableByOrderId"), "releaseTableByOrderId missing");
  assert(src.includes("isBranchKitchenWorkflowEnabled"), "isBranchKitchenWorkflowEnabled missing");
});

addCheck("6", "categoryRoute uses authedTenantLocation stack", () => {
  const src = readText("apps/pos-backend/routes/categoryRoute.js");
  assert(src.includes("authedTenantLocation"), "authedTenantLocation missing from categoryRoute");
});

addCheck("9", "orderTotals exports modifierAdjustmentForLine", () => {
  const src = readText("apps/pos-backend/utils/orderTotals.js");
  assert(src.includes("modifierAdjustmentForLine"), "modifierAdjustmentForLine missing");
});

addCheck("9-print", "orderPrinting exposes printCustomerReceipt", () => {
  const src = readText("apps/pos-backend/services/orderPrinting.js");
  assert(src.includes("printCustomerReceipt"), "printCustomerReceipt missing");
});

addCheck("14", "user locationIds backfill migration exists", () => {
  assert(
    fileExists("apps/pos-backend/migrations/2026-04-27-004-user-locationIds-backfill.js"),
    "missing 004 user-locationIds backfill migration",
  );
});

addCheck("21", "discount catalog model file exists", () => {
  assert(fileExists("apps/pos-backend/models/discountCatalogModel.js"), "missing discountCatalogModel.js");
});

addCheck("35", "report schedule service uses node-cron", () => {
  const src = readText("apps/pos-backend/services/reportScheduleService.js");
  assert(src.includes('require("node-cron")') || src.includes("require('node-cron')"), "node-cron require missing");
});

addCheck("38", "sales-by-waiter report page exists", () => {
  assert(
    fileExists("apps/pos-frontend2/src/app/(main)/dashboard/reports/sales-by-waiter/page.tsx"),
    "missing sales-by-waiter page",
  );
});

addCheck("31-fe", "shared export-pdf / export-excel libs exist", () => {
  assert(fileExists("apps/pos-frontend2/src/lib/reports/export-pdf.ts"), "missing export-pdf.ts");
  assert(fileExists("apps/pos-frontend2/src/lib/reports/export-excel.ts"), "missing export-excel.ts");
});

addCheck("31-inv", "inventory admin dashboard imports PDF and Excel export helpers", () => {
  const src = readText("apps/pos-frontend2/src/app/(main)/dashboard/inventory/_components/inventory-admin-dashboard.tsx");
  assert(src.includes("exportReportPdf"), "inventory-admin-dashboard missing exportReportPdf");
  assert(src.includes("exportReportExcel"), "inventory-admin-dashboard missing exportReportExcel");
});

addCheck("31-waste", "wastage page wires PDF exports (by reason + entries)", () => {
  const src = readText("apps/pos-frontend2/src/app/(main)/dashboard/inventory/wastage/page.tsx");
  assert(src.includes("exportReportPdf"), "wastage page missing exportReportPdf");
  assert(src.includes("inventory-wastage-by-reason.pdf"), "wastage by-reason PDF filename missing");
  assert(src.includes("inventory-wastage-entries.pdf"), "wastage entries PDF filename missing");
});

addCheck("31-menu", "menu availability page wires PDF and Excel exports", () => {
  const src = readText("apps/pos-frontend2/src/app/(main)/dashboard/inventory/menu-availability/page.tsx");
  assert(src.includes("exportReportPdf"), "menu-availability missing exportReportPdf");
  assert(src.includes("exportReportExcel"), "menu-availability missing exportReportExcel");
  assert(src.includes("menu-inventory-availability"), "menu availability export basename missing");
});

addCheck("33-pnl", "P&L page imports ReportCompareControls", () => {
  const src = readText("apps/pos-frontend2/src/app/(main)/dashboard/accounting/pnl/page.tsx");
  assert(src.includes("ReportCompareControls"), "pnl page missing ReportCompareControls");
});

addCheck("33-disc", "discounts audit page imports ReportCompareControls", () => {
  const src = readText("apps/pos-frontend2/src/app/(main)/dashboard/discounts/page.tsx");
  assert(src.includes("ReportCompareControls"), "discounts page missing ReportCompareControls");
});

addCheck("41", "register sessions page includes cash close checklist", () => {
  const src = readText("apps/pos-frontend2/src/app/(main)/dashboard/accounting/sessions/page.tsx");
  assert(src.includes("Cash close checklist"), "sessions page missing Cash close checklist");
});

addCheck("fe-policy", "inventory API types stockDeductTrigger as payment only", () => {
  const src = readText("apps/pos-frontend2/src/lib/inventory-api.ts");
  assert(src.includes('stockDeductTrigger: "payment"'), "PosInventoryPolicy should narrow to payment");
});

addCheck("40", "accounting route file exists (AP / GL surface)", () => {
  assert(fileExists("apps/pos-backend/routes/accountingRoute.js"), "missing accountingRoute.js");
});

addCheck("43", "audit log model exists", () => {
  assert(fileExists("apps/pos-backend/models/auditLogModel.js"), "missing auditLogModel.js");
});

/**
 * @returns {void}
 */
function runOrderLifecycleSelftest() {
  const scriptPath = path.join(REPO_ROOT, "apps", "pos-backend", "scripts", "order-lifecycle-selftest.js");
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: path.join(REPO_ROOT, "apps", "pos-backend"),
    encoding: "utf8",
    env: process.env,
  });
  assert(result.status === 0, `order-lifecycle-selftest exited ${result.status}\n${result.stderr || result.stdout}`);
}

/**
 * @returns {void}
 */
function runFrontendTsc() {
  const result = spawnSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], {
    cwd: path.join(REPO_ROOT, "apps", "pos-frontend2"),
    encoding: "utf8",
    shell: true,
  });
  assert(
    result.status === 0,
    `pos-frontend2 tsc failed (${result.status})\n${result.stdout || ""}\n${result.stderr || ""}`,
  );
}

/**
 * @returns {void}
 */
function main() {
  const skipTsc = process.argv.includes("--skip-tsc");
  let failures = 0;

  for (const check of checks) {
    try {
      check.run();
      console.log(`OK  [${check.id}] ${check.name}`);
    } catch (err) {
      failures += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FAIL [${check.id}] ${check.name}: ${message}`);
    }
  }

  try {
    runOrderLifecycleSelftest();
    console.log("OK  [V1-chain] apps/pos-backend/scripts/order-lifecycle-selftest.js");
  } catch (err) {
    failures += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FAIL [V1-chain] order-lifecycle-selftest: ${message}`);
  }

  if (!skipTsc) {
    try {
      runFrontendTsc();
      console.log("OK  [tsc] apps/pos-frontend2 typecheck (--noEmit)");
    } catch (err) {
      failures += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FAIL [tsc] ${message}`);
    }
  } else {
    console.log("SKIP [tsc] (--skip-tsc)");
  }

  if (failures > 0) {
    console.error(`\nzerowix-qa-checklist-selftest: ${failures} failure(s).`);
    process.exit(1);
  }
  console.log("\nzerowix-qa-checklist-selftest: all checks passed.");
  process.exit(0);
}

main();
