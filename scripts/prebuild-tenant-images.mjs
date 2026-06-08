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

import { loadRootEnv } from "./load-root-env.mjs";

const ROOT = loadRootEnv(import.meta.url);
const FORCE = process.argv.includes("--force");
const VERIFY_ONLY = process.argv.includes("--verify");

const FINANCE_ROOT =
  process.env.STOCKIX_TENANT_APP_ROOT?.trim() ||
  path.join(ROOT, "services", "stockix-finance");
const TENANT_COMPOSE = path.join(ROOT, "infra", "tenant-stack", "docker-compose.yml");
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
  "stockix-webapp:local",
  "stockix-server:local",
  "stockix-database-migration:local",
  "stockix-nginx:local",
  // Data-service images: locally built, not on Docker Hub. compose runs with --no-build,
  // so these must exist before provisioning or Docker will attempt a registry pull and fail.
  "stockix-prebuild-mysql:latest",
  "stockix-prebuild-redis:latest",
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

// ── 1. Pull base images ─────────────────────────────────────────────────────
console.log("\n[prebuild] Phase 1: Pull base images");

run("Pull node:20-bookworm-slim", "docker pull node:20-bookworm-slim");
run("Pull node:20-alpine", "docker pull node:20-alpine");
run("Pull nginx:1.27-alpine", "docker pull nginx:1.27-alpine");
run("Pull mongo:5.0", "docker pull mongo:5.0");
run("Pull mariadb:10.6", "docker pull mariadb:10.6 || docker pull mariadb:10");
run("Pull redis:alpine", "docker pull redis:alpine");

// ── 2. Build Finance images ───────────────────────────────────────────────────
console.log("\n[prebuild] Phase 2: Build Finance images");

syncRepoSharedIntoFinanceTree();
run(
  "pnpm install (stockix-finance lockfile)",
  "pnpm install --ignore-scripts --config.engine-strict=false",
  FINANCE_ROOT,
);

if (!FORCE && imageExists("stockix-webapp:local")) {
  console.log("[prebuild] stockix-webapp:local already exists — skipping");
} else {
  run(
    "Build stockix-webapp",
    "docker build -t stockix-webapp:local -f packages/webapp/Dockerfile .",
    FINANCE_ROOT,
  );
}

if (!FORCE && imageExists("stockix-server:local")) {
  console.log("[prebuild] stockix-server:local already exists — skipping");
} else {
  run(
    "Build stockix-server",
    "docker build -t stockix-server:local -f packages/server/Dockerfile --target app .",
    FINANCE_ROOT,
  );
}

if (!FORCE && imageExists("stockix-database-migration:local")) {
  console.log("[prebuild] stockix-database-migration:local already exists — skipping");
} else {
  run(
    "Build stockix-database-migration",
    "docker build -t stockix-database-migration:local -f packages/server/Dockerfile --target migration .",
    FINANCE_ROOT,
  );
}

if (!FORCE && imageExists("stockix-nginx:local")) {
  console.log("[prebuild] stockix-nginx:local already exists — skipping");
} else {
  run("Build stockix-nginx", "docker build -t stockix-nginx:local docker/nginx/", FINANCE_ROOT);
}

// ── 3. Warm mysql/redis build cache (per-tenant compose still tags by project) ─
console.log("\n[prebuild] Phase 3: Warm tenant data-service build cache");

const composeEnv = {
  ...process.env,
  STOCKIX_TENANT_APP_ROOT: FINANCE_ROOT,
  COMPOSE_PROJECT_NAME: "stockix-prebuild",
  SYSTEM_DB_NAME: "stockix_system",
  DB_USER: "stockix",
  DB_PASSWORD: "stockix",
  DB_CHARSET: "utf8mb4",
  DB_ROOT_PASSWORD: "stockix_root",
  MYSQL_VOLUME_NAME: "stockix_prebuild_mysql",
  // Dummy values prevent "variable is not set" warnings when compose parses the file during build.
  REDIS_PASSWORD: "prebuild-placeholder",
  MONGO_ROOT_PASSWORD: "prebuild-placeholder",
};

run(
  "Compose build mysql + redis (cache warm)",
  `docker compose -f "${TENANT_COMPOSE}" -p stockix-prebuild build mysql redis`,
  ROOT,
  composeEnv,
);

// ── 4. Verify ───────────────────────────────────────────────────────────────
verifyImages();

console.log("\n[prebuild] Done. Provision tenants with cached Finance images.");
console.log("[prebuild] After Finance code changes: pnpm docker:prebuild:force");
