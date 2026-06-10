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
import { existsSync } from "node:fs";
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
function runDockerBuild(label, tag, target) {
  const dockerfile = "services/stockix-finance/packages/server/Dockerfile";
  const buildkitCmd =
    `docker build --progress=plain -t ${tag} -f ${dockerfile} --target ${target} .`;
  const legacyCmd =
    `docker build -t ${tag} -f ${dockerfile} --target ${target} .`;
  const attempts = [
    { label: `${label} (BuildKit)`, cmd: buildkitCmd, env: { DOCKER_BUILDKIT: "1" } },
    {
      label: `${label} (legacy builder retry)`,
      cmd: legacyCmd,
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
        cwd: ROOT,
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

function verifyRuntimeImageTruth(tag) {
  const checks = [
    {
      label: "webapp-dist/index.html",
      cmd: `docker run --rm --entrypoint sh ${tag} -c "test -f /app/packages/server/webapp-dist/index.html"`,
    },
    {
      label: "build/index.js",
      cmd: `docker run --rm --entrypoint sh ${tag} -c "test -f /app/packages/server/build/index.js"`,
    },
    {
      label: "no packages/server/src in image",
      cmd: `docker run --rm --entrypoint sh ${tag} -c "! test -d /app/packages/server/src"`,
    },
    {
      label: "no babel-loader in prod node_modules",
      cmd: `docker run --rm --entrypoint sh ${tag} -c "! test -d /app/node_modules/babel-loader && ! test -d /app/packages/server/node_modules/babel-loader"`,
    },
    {
      label: "no gulp in prod node_modules",
      cmd: `docker run --rm --entrypoint sh ${tag} -c "! test -d /app/node_modules/gulp && ! test -d /app/packages/server/node_modules/gulp"`,
    },
    {
      label: "CMD uses build/index.js",
      cmd: `docker image inspect --format "{{json .Config.Cmd}}" ${tag}`,
      expectIncludes: "build/index.js",
    },
  ];

  let ok = true;
  for (const check of checks) {
    try {
      const out = execSync(check.cmd, { stdio: "pipe", shell: true }).toString();
      if (check.expectIncludes && !out.includes(check.expectIncludes)) {
        console.error(`[prebuild] ❌ ${tag}: ${check.label} — CMD mismatch`);
        ok = false;
        continue;
      }
      console.log(`[prebuild] ✅ ${tag}: ${check.label}`);
    } catch {
      console.error(`[prebuild] ❌ ${tag}: ${check.label}`);
      ok = false;
    }
  }
  return ok;
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

  if (imageExists("stockix-server:local")) {
    console.log("\n[prebuild] Docker runtime truth validation");
    if (!verifyRuntimeImageTruth("stockix-server:local")) {
      process.exit(1);
    }
  }

  console.log("\n[prebuild] All required Finance images are present and runtime-valid.");
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

// Finance has legacy deps (e.g. objection-filter@4.0.1) with stale
// engines.node declarations (<=12.x.x) that run fine on Node 22.
run(
  "pnpm install (monorepo workspace — @repo/shared from packages/shared)",
  "pnpm install --ignore-scripts --config.engine-strict=false",
  ROOT,
);

if (!FORCE && imageExists("stockix-server:local")) {
  console.log("[prebuild] stockix-server:local already exists — skipping");
} else {
  runDockerBuild("Build stockix-server", "stockix-server:local", "runtime");
}

if (!FORCE && imageExists("stockix-database-migration:local")) {
  console.log("[prebuild] stockix-database-migration:local already exists — skipping");
} else {
  runDockerBuild(
    "Build stockix-database-migration",
    "stockix-database-migration:local",
    "migration-runtime",
  );
}

// ── 3. Verify ───────────────────────────────────────────────────────────────
verifyImages();

console.log("\n[prebuild] Done. Provision tenants with cached Finance images.");
console.log("[prebuild] After Finance code changes: pnpm docker:prebuild:force");
