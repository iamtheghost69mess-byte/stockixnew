#!/usr/bin/env node
/**
 * Runs automated unit tests for the POS ↔ Finance integration bridge (Phases 0–4).
 * Does not replace staging manual E2E — see docs/section-4-integration-e2e-checklist.md
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const testFiles = [
  "tests/unit/accounting-integration-outbox.test.js",
  "tests/unit/accounting-integration-events.test.js",
  "tests/unit/bigcapital-sync-processor.test.js",
  "tests/unit/build-sale-receipt-partial-unmapped.test.js",
  "tests/unit/combined-org-provision-guard.test.js",
  "tests/unit/bigcapital-integration-health.test.js",
  "tests/unit/platform-integration-wire.test.js",
  "tests/unit/finance-recipe-cost.test.js",
];

const cwd = path.resolve(__dirname, "..");
const result = spawnSync(
  process.execPath,
  ["--test", ...testFiles],
  { cwd, stdio: "inherit", env: process.env }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("\nAccounting integration unit tests: ALL OK");
console.log("Next: docs/section-4-integration-e2e-checklist.md (staging manual sign-off)\n");
process.exit(0);
