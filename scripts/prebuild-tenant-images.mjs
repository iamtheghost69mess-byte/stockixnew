#!/usr/bin/env node
/**
 * Pre-builds Docker images needed for tenant provisioning.
 * Run once before first provision, or after Finance code changes (--force).
 *
 * Usage:
 *   node scripts/prebuild-tenant-images.mjs
 *   node scripts/prebuild-tenant-images.mjs --force
 *   node scripts/prebuild-tenant-images.mjs --verify
 * Or: pnpm docker:prebuild
 */

import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadRootEnv } from "./load-root-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = loadRootEnv(import.meta.url);
const FORCE = process.argv.includes("--force");
const VERIFY_ONLY = process.argv.includes("--verify");

const FINANCE_ROOT =
  process.env.STOCKIX_TENANT_APP_ROOT?.trim() ||
  path.join(ROOT, "services", "stockix-finance");
const REPO_SHARED_PKG = path.join(ROOT, "packages", "shared");
/** Copied into Finance tree for Docker context (@repo/shared workspace dep). */
const FINANCE_SHARED_PKG = path.join(FINANCE_ROOT, "packages", "shared");

function syncRepoSharedIntoFinanceTree() {
  if (!existsSync(REPO_SHARED_PKG)) {
    console.error(`[prebuild] ERROR: @repo/shared not found: ${REPO_SHARED_PKG}`);
    process.exit(1);
  }
  rmSync(FINANCE_SHARED_PKG, { recursive: true, force: true });
  cpSync(REPO_SHARED_PKG, FINANCE_SHARED_PKG, { recursive: true });
  console.log("[prebuild] Synced packages/shared → services/stockix-finance/packages/shared");
}

const REQUIRED_FINANCE_IMAGES = [
  "stockix-server:local",
  "stockix-database-migration:local",
];

function run(label, cmd, cwd = ROOT, extraEnv = {}) {
  console.log(`\n[prebuild] ▶ ${label}`);
  console.log(`[prebuild]   ${cmd}`);
  const start = Date.now();
  try {
    execSync(cmd, {
      cwd,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...extraEnv },
    });
    const sec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[prebuild] ✅ ${label} — done in ${sec}s`);
  } catch {
    console.error(`[prebuild] ❌ ${label} FAILED`);
    process.exit(1);
  }
}

/** Docker BuildKit on Windows can drop with rpc error: Unavailable EOF under memory pressure. */
function runDockerBuild(label, tag, target, cwd) {
  const baseCmd =
    `docker build --progress=plain -t ${tag} -f packages/server/Dockerfile --target ${target} .`;
  const attempts = [
    { label: `${label} (BuildKit)`, cmd: baseCmd, env: { DOCKER_BUILDKIT: "1" } },
    {
      label: `${label} (legacy builder retry)`,
      cmd: baseCmd,
      env: { DOCKER_BUILDKIT: "0" },
    },
  ];

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    console.log(`\n[prebuild] ▶ ${attempt.label}`);
    console.log(`[prebuild]   ${attempt.cmd}`);
    const start = Date.now();
    try {
      execSync(attempt.cmd, {
        cwd,
        stdio: "inherit",
        shell: true,
        env: { ...process.env, ...attempt.env },
      });
      const sec = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[prebuild] ✅ ${attempt.label} — done in ${sec}s`);
      return;
    } catch (err) {
      const sec = ((Date.now() - start) / 1000).toFixed(1);
      console.error(`[prebuild] ❌ ${attempt.label} FAILED after ${sec}s`);
      if (i < attempts.length - 1) {
        console.warn(
          "[prebuild] Retrying with legacy Docker builder (common fix for rpc error: Unavailable EOF on Windows).",
        );
        continue;
      }
      console.error(
        "[prebuild] Tip: increase Docker Desktop memory (Settings → Resources) if builds keep failing.",
      );
      process.exit(1);
    }
  }
}

function imageExists(tag) {
  try {
    execSync(`docker image inspect ${tag}`, { stdio: "pipe", shell: true });
    return true;
  } catch {
    return false;
  }
}

function verifyImages() {
  console.log("\n[prebuild] Verify images");
  let allGood = true;
  for (const image of REQUIRED_FINANCE_IMAGES) {
    if (imageExists(image)) {
      console.log(`[prebuild] ✅ ${image}`);
    } else {
      console.error(`[prebuild] ❌ MISSING: ${image}`);
      allGood = false;
    }
  }
  if (!allGood) {
    process.exit(1);
  }
  console.log("\n[prebuild] All required Finance images are present.");
}

if (VERIFY_ONLY) {
  verifyImages();
  process.exit(0);
}

console.log("[prebuild] Starting tenant image pre-build...");
console.log("[prebuild] Finance root:", FINANCE_ROOT);
if (FORCE) {
  console.log("[prebuild] --force: rebuilding even when images exist");
}

if (!existsSync(FINANCE_ROOT)) {
  console.error(`[prebuild] ERROR: Finance root not found: ${FINANCE_ROOT}`);
  process.exit(1);
}

function dockerDaemonHealthy() {
  try {
    execSync("docker version", { stdio: "pipe", shell: true });
    return true;
  } catch {
    return false;
  }
}

function pullBaseImage(label, tag) {
  if (imageExists(tag)) {
    console.log(`[prebuild] ${tag} already present locally — skipping pull`);
    return;
  }
  run(label, `docker pull ${tag}`);
}

// ── 1. Pull base images ─────────────────────────────────────────────────────
console.log("\n[prebuild] Phase 1: Pull base images");

if (!dockerDaemonHealthy()) {
  console.error(
    "[prebuild] Docker daemon is not responding (Internal Server Error / rpc error).",
  );
  console.error(
    "[prebuild] Restart Docker Desktop, wait until it is running, then re-run: pnpm docker:prebuild:force",
  );
  process.exit(1);
}

pullBaseImage("Pull node:22-bookworm-slim", "node:22-bookworm-slim");
pullBaseImage("Pull node:22-alpine", "node:22-alpine");

// ── 2. Build Finance images ───────────────────────────────────────────────────
console.log("\n[prebuild] Phase 2: Build Finance images");

syncRepoSharedIntoFinanceTree();
// Finance has legacy deps (e.g. objection-filter@4.0.1) with stale
// engines.node declarations (<=12.x.x) that run fine on Node 22.
// services/stockix-finance/.npmrc sets engine-strict=false for this step.
// Docker builds inside the container are unaffected.
run(
  "pnpm install (stockix-finance lockfile)",
  "pnpm install --ignore-scripts --config.engine-strict=false",
  FINANCE_ROOT,
);

if (!FORCE && imageExists("stockix-server:local")) {
  console.log("[prebuild] stockix-server:local already exists — skipping");
} else {
  runDockerBuild("Build stockix-server", "stockix-server:local", "app", FINANCE_ROOT);
}

if (!FORCE && imageExists("stockix-database-migration:local")) {
  console.log("[prebuild] stockix-database-migration:local already exists — skipping");
} else {
  runDockerBuild(
    "Build stockix-database-migration",
    "stockix-database-migration:local",
    "migration",
    FINANCE_ROOT,
  );
}

// ── 3. Verify ───────────────────────────────────────────────────────────────
verifyImages();

console.log("\n[prebuild] Done. Provision tenants with cached Finance images.");
console.log("[prebuild] After Finance code changes: pnpm docker:prebuild:force");
