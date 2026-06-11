#!/usr/bin/env node
/**
 * Stockix Tenant Prebuild System (Production Safe)
 * ------------------------------------------------
 * - Fully cross-platform (Windows / WSL / CI)
 * - No hardcoded /mnt/c paths
 * - Safe Docker retry strategy
 * - Deterministic tenant image builds
 *
 * Usage:
 *   pnpm docker:prebuild
 *   pnpm docker:prebuild:force
 *   pnpm docker:prebuild:verify
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

// 🧠 ALWAYS USE RELATIVE ROOT-BASED PATHS
const FINANCE_ROOT =
  process.env.STOCKIX_TENANT_APP_ROOT?.trim() ||
  path.resolve(ROOT, "services", "stockix-finance");

const REQUIRED_FINANCE_IMAGES = [
  "stockix-server:local",
  "stockix-database-migration:local",
];

// ─────────────────────────────────────────────────────────────
// Core runner (safe logging + failure control)
// ─────────────────────────────────────────────────────────────
function run(label, cmd, cwd = ROOT, extraEnv = {}) {
  console.log(`\n[prebuild] ▶ ${label}`);
  console.log(`[prebuild] $ ${cmd}`);

  const start = Date.now();

  try {
    execSync(cmd, {
      cwd,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...extraEnv },
    });

    console.log(
      `[prebuild] ✅ ${label} (${((Date.now() - start) / 1000).toFixed(1)}s)`
    );
  } catch (err) {
    console.error(`[prebuild] ❌ ${label} FAILED`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Shared package sync (safe cross-platform)
// ─────────────────────────────────────────────────────────────
const FINANCE_SHARED_LINK = path.join(FINANCE_ROOT, "packages", "shared");
const MONOREPO_SHARED = path.resolve(ROOT, "packages", "shared");

function syncFinanceSharedPackage() {
  if (!existsSync(MONOREPO_SHARED)) {
    throw new Error(`Shared package not found: ${MONOREPO_SHARED}`);
  }

  rmSync(FINANCE_SHARED_LINK, { recursive: true, force: true });

  cpSync(MONOREPO_SHARED, FINANCE_SHARED_LINK, {
    recursive: true,
    filter: (src) => !src.includes("node_modules"),
  });

  console.log("[prebuild] Synced shared package → finance");
}

// ─────────────────────────────────────────────────────────────
// Docker helpers
// ─────────────────────────────────────────────────────────────
function imageExists(tag) {
  try {
    execSync(`docker image inspect ${tag}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function dockerDaemonHealthy() {
  try {
    execSync("docker version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Safe Docker build (retry strategy)
// ─────────────────────────────────────────────────────────────
function runDockerBuild(label, tag, target) {
  const dockerfile = "packages/server/Dockerfile";

  const commands = [
    {
      label: `${label} (BuildKit)`,
      cmd: `docker build --progress=plain -t ${tag} -f ${dockerfile} --target ${target} .`,
      env: { DOCKER_BUILDKIT: "1" },
    },
    {
      label: `${label} (legacy fallback)`,
      cmd: `docker build -t ${tag} -f ${dockerfile} --target ${target} .`,
      env: { DOCKER_BUILDKIT: "0" },
    },
  ];

  for (const attempt of commands) {
    try {
      run(attempt.label, attempt.cmd, FINANCE_ROOT, attempt.env);
      return;
    } catch (err) {
      console.warn(`[prebuild] retrying fallback...`);
    }
  }

  throw new Error(`${label} failed after all retries`);
}

// ─────────────────────────────────────────────────────────────
// Verification
// ─────────────────────────────────────────────────────────────
function verifyImages() {
  console.log("\n[prebuild] Verify images");

  for (const img of REQUIRED_FINANCE_IMAGES) {
    if (!imageExists(img)) {
      throw new Error(`Missing image: ${img}`);
    }
    console.log(`[prebuild] ✓ ${img}`);
  }

  console.log("[prebuild] All images verified");
}

// ─────────────────────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────────────────────
if (VERIFY_ONLY) {
  verifyImages();
  process.exit(0);
}

console.log("[prebuild] Starting...");
console.log("[prebuild] Finance root:", FINANCE_ROOT);

if (!existsSync(FINANCE_ROOT)) {
  throw new Error(`Finance root not found: ${FINANCE_ROOT}`);
}

if (!dockerDaemonHealthy()) {
  throw new Error("Docker daemon not running");
}

// ── Phase 1 ────────────────────────────────────────────────
console.log("\n[prebuild] Phase 1: base images");

run("Pull node:22", "docker pull node:22-bookworm-slim");
run("Pull alpine node", "docker pull node:22-alpine");

// ── Phase 2 ────────────────────────────────────────────────
console.log("\n[prebuild] Phase 2: Finance build");

syncFinanceSharedPackage();

if (!FORCE && imageExists("stockix-server:local")) {
  console.log("[prebuild] server image exists — skipping");
} else {
  runDockerBuild("Build server", "stockix-server:local", "runtime");
}

if (!FORCE && imageExists("stockix-database-migration:local")) {
  console.log("[prebuild] migration image exists — skipping");
} else {
  runDockerBuild(
    "Build migration",
    "stockix-database-migration:local",
    "migration-runtime"
  );
}

// ── Phase 3 ────────────────────────────────────────────────
verifyImages();

console.log("\n[prebuild] DONE ✔");