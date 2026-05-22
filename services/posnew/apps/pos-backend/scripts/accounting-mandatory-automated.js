#!/usr/bin/env node
/* eslint-env node */
/* global require, process, console, __dirname */
/**
 * Automated slice of accounting phase mandatory checks (no browser).
 *
 * Always runs:
 *   - accounting-pdf-selftest.js (T2.4-style PDF sanity; no DB)
 *
 * When MONGODB_URI is set:
 *   - accounting-studio-verification.js (service-layer AR/AP/reports/budget smoke)
 *
 * Does NOT replace manual T6.x–T8.x from ACCOUNTING.md §4 (sessions UI, exports UX, RBAC matrix).
 *
 * Run: npm run test:accounting:mandatory --prefix apps/pos-backend
 */
require("dotenv").config();
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

function runNode(relScript) {
  const r = spawnSync(process.execPath, [path.join(root, relScript)], {
    stdio: "inherit",
    env: process.env,
  });
  return r.status === 0;
}

console.log("=== accounting-mandatory-automated: PDF selftest ===\n");
if (!runNode("scripts/accounting-pdf-selftest.js")) {
  process.exit(1);
}

if (process.env.MONGODB_URI) {
  console.log("\n=== accounting-mandatory-automated: studio verification (MongoDB) ===\n");
  if (!runNode("scripts/accounting-studio-verification.js")) {
    process.exit(1);
  }
} else {
  console.log("\n[SKIP] test:accounting:studio — set MONGODB_URI to run DB-backed accounting smoke.\n");
}

console.log("\naccounting-mandatory-automated: OK (automated parts).");
console.log("Manual T6–T8 matrix and sign-off: acc&invetmissing/ACCOUNTING.md §4.\n");
