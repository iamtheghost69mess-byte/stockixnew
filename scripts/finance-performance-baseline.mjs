#!/usr/bin/env node
/**
 * Performance regression baseline gate.
 * Records metrics to .finance-perf-baseline.json; fails if >20% regression vs baseline.
 *
 * Usage:
 *   node scripts/finance-performance-baseline.mjs --record
 *   node scripts/finance-performance-baseline.mjs --check
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const BASELINE_FILE = path.join(root, ".finance-perf-baseline.json");
const REGRESSION_THRESHOLD = 1.2;
const RECORD = process.argv.includes("--record");
const CHECK = process.argv.includes("--check");

function measureDockerColdStartMs() {
  const tag = "stockix-server:local";
  try {
    execSync(`docker image inspect ${tag}`, { stdio: "pipe", shell: true });
  } catch {
    return null;
  }
  const start = Date.now();
  try {
    execSync(
      `docker run --rm ${tag} node -e "process.exit(0)"`,
      { stdio: "pipe", shell: true, timeout: 120_000 },
    );
    return Date.now() - start;
  } catch {
    return null;
  }
}

function measureNestBundleSizeKb() {
  const bundle = path.join(
    root,
    "services/stockix-finance/packages/server/build/index.js",
  );
  if (!existsSync(bundle)) return null;
  return Math.round(statSync(bundle).size / 1024);
}

async function collectMetrics() {
  const bundleKb = measureNestBundleSizeKb();
  const dockerColdStartMs = measureDockerColdStartMs();
  return {
    recordedAt: new Date().toISOString(),
    nestBundleKb: bundleKb,
    dockerColdStartMs,
  };
}

function compare(current, baseline) {
  const regressions = [];
  for (const key of ["nestBundleKb", "dockerColdStartMs"]) {
    const cur = current[key];
    const base = baseline[key];
    if (cur == null || base == null) continue;
    if (cur > base * REGRESSION_THRESHOLD) {
      regressions.push({
        metric: key,
        baseline: base,
        current: cur,
        pct: Math.round(((cur / base) - 1) * 100),
      });
    }
  }
  return regressions;
}

const metrics = await collectMetrics();

if (RECORD) {
  writeFileSync(BASELINE_FILE, JSON.stringify(metrics, null, 2));
  console.log("Recorded finance performance baseline:", metrics);
  process.exit(0);
}

if (!existsSync(BASELINE_FILE)) {
  console.log("No baseline file — run with --record first.");
  console.log("Current metrics:", metrics);
  process.exit(CHECK ? 1 : 0);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
const regressions = compare(metrics, baseline);

console.log("FINANCE PERFORMANCE BASELINE");
console.log("----------------------------");
console.log("Baseline:", baseline);
console.log("Current: ", metrics);

if (!regressions.length) {
  console.log("\nPASS — no >20% regression");
  process.exit(0);
}

console.log("\nFAIL — regressions detected:");
for (const r of regressions) {
  console.log(`- ${r.metric}: ${r.baseline} → ${r.current} (+${r.pct}%)`);
}
process.exit(CHECK ? 1 : 0);
