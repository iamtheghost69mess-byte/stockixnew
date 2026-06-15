#!/usr/bin/env node

/**
 * Professional provisioning test suite (module scenarios).
 *
 * Runs provisioning for:
 *   1) Accounting only
 *   2) POS only
 *   3) Accounting + POS combined
 *
 * It intentionally calls the existing `provision-module-matrix.mjs` runner
 * with `--only` to keep the real assertions in one place.
 *
 * Usage (repo root):
 *   pnpm --filter api provision-modules-suite
 *   pnpm --filter api provision-modules-suite -- --retries 1 --report ./provision-suite-report.json
 */

import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const argv = process.argv.slice(2);
const retries = Number(argv.includes("--retries") ? argv[argv.indexOf("--retries") + 1] : "1") || 1;

function argValue(flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  return argv[i + 1] ?? null;
}

const reportPathRaw = argValue("--report");
const reportPath =
  reportPathRaw != null
    ? path.isAbsolute(reportPathRaw)
      ? reportPathRaw
      : path.resolve(REPO_ROOT, reportPathRaw)
    : path.resolve(
        REPO_ROOT,
        `provision-module-suite-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      );

const scenarios = [
  { id: "accounting", label: "Accounting only", onlyArg: "accounting" },
  { id: "pos", label: "POS only", onlyArg: "pos" },
  { id: "both", label: "Accounting + POS combined", onlyArg: "both" },
];

function tail(text, n = 2000) {
  const s = typeof text === "string" ? text : String(text ?? "");
  if (s.length <= n) return s;
  return s.slice(-n);
}

async function runScenario({ onlyArg, label }, attempt) {
  const start = Date.now();
  const cmd = [
    "pnpm",
    "--filter",
    "api",
    "provision-modules",
    "--",
    "--only",
    onlyArg,
  ];

  const res = await execa(cmd[0], cmd.slice(1), {
    cwd: REPO_ROOT,
    env: process.env,
    reject: false,
  });

  const elapsedSec = Math.round((Date.now() - start) / 1000);
  const combined = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;

  return {
    label,
    onlyArg,
    attempt,
    exitCode: res.exitCode ?? 1,
    elapsedSec,
    passed: (res.exitCode ?? 1) === 0,
    outputTail: tail(combined),
  };
}

async function runWithRetries(scenario) {
  const attempts = Math.max(1, retries);
  const results = [];

  for (let i = 1; i <= attempts; i += 1) {
    console.log(`\n▶️  ${scenario.label} (attempt ${i}/${attempts})`);
    // eslint-disable-next-line no-await-in-loop
    const r = await runScenario(scenario, i);
    results.push(r);
    if (r.passed) return results;
    console.log(`❌ ${scenario.label} failed (exitCode=${r.exitCode}) after ${r.elapsedSec}s`);
  }

  return results;
}

async function preflight() {
  console.log("Preflight: API health, Docker, owners, and POS compose config");
  const cmd = ["pnpm", "--filter", "api", "provision-modules", "--", "--preflight"];
  const res = await execa(cmd[0], cmd.slice(1), {
    cwd: REPO_ROOT,
    env: process.env,
    reject: false,
  });
  if ((res.exitCode ?? 1) !== 0) {
    throw new Error(`Preflight failed (exitCode=${res.exitCode})\n${tail(`${res.stdout ?? ""}\n${res.stderr ?? ""}`)}`);
  }
}

async function main() {
  console.log("Provision module suite");
  console.log(`Report: ${reportPath}`);
  console.log(`Retries per scenario: ${retries}`);

  await preflight();

  const suiteStart = Date.now();
  const scenarioResults = [];
  let allPassed = true;

  for (const scenario of scenarios) {
    // eslint-disable-next-line no-await-in-loop
    const results = await runWithRetries(scenario);
    scenarioResults.push({ scenario, attempts: results });
    const last = results[results.length - 1];
    if (!last.passed) allPassed = false;
  }

  const elapsedSec = Math.round((Date.now() - suiteStart) / 1000);
  const report = {
    startedAt: new Date(suiteStart).toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedSec,
    retries,
    allPassed,
    scenarioResults,
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n=== Suite summary ===");
  for (const r of scenarioResults) {
    const last = r.attempts[r.attempts.length - 1];
    console.log(
      `- ${r.scenario.label}: ${last.passed ? "PASS" : "FAIL"} (attempts=${r.attempts.length}, exitCode=${last.exitCode})`,
    );
  }

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

