#!/usr/bin/env node
/**
 * Pre-build per-tenant POS Docker images (stockix-pos-backend:local, stockix-pos-frontend:local).
 *
 * Usage:
 *   pnpm pos:images:build
 *   pnpm pos:images:build -- --force
 *   pnpm pos:images:build -- --backend-only
 *   pnpm pos:images:build -- --stub-frontend    # nginx placeholder only (not a real POS UI)
 *
 * Default builds the real Next.js POS UI. Run before first POS provision or after POS changes.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadRootEnv } from "./load-root-env.mjs";

const ROOT = loadRootEnv(import.meta.url);
const FORCE = process.argv.includes("--force");
const BACKEND_ONLY = process.argv.includes("--backend-only");
const STUB_FRONTEND = process.argv.includes("--stub-frontend");
const FULL_FRONTEND = !STUB_FRONTEND;
const posAppRaw = process.env.POS_APP_ROOT?.trim() || path.join("apps", "pos-backend");
const POS_ROOT = path.isAbsolute(posAppRaw) ? posAppRaw : path.join(ROOT, posAppRaw);
const COMPOSE = path.join(ROOT, "infra", "pos-tenant-stack", "docker-compose.yml");

const POS_IMAGES = ["stockix-pos-backend:local", "stockix-pos-frontend:local"];

function run(label, cmd, cwd = ROOT, extraEnv = {}) {
  console.log(`\n[pos:images] ${label}`);
  console.log(`[pos:images]   ${cmd}`);
  const start = Date.now();
  try {
    execSync(cmd, {
      cwd,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...extraEnv },
    });
    console.log(`[pos:images] done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  } catch {
    console.error(`[pos:images] FAILED: ${label}`);
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

if (!existsSync(POS_ROOT)) {
  console.error(`[pos:images] POS_APP_ROOT not found: ${POS_ROOT}`);
  process.exit(1);
}

if (!existsSync(path.join(ROOT, "packages", "auth", "dist"))) {
  run("Build @repo/auth", "pnpm --filter @repo/auth build", ROOT);
}

const skipBackend = !FORCE && imageExists("stockix-pos-backend:local");
const skipFrontend = !FORCE && imageExists("stockix-pos-frontend:local");

const composeEnv = {
  STOCKIX_REPO_ROOT: ROOT,
  POS_APP_ROOT: POS_ROOT,
  COMPOSE_PROJECT_NAME: "stockix-pos-image-build",
  AUTH_TOKEN_SECRET: process.env.AUTH_TOKEN_SECRET || "pos-image-build-secret",
  POS_PLATFORM_API_KEY: process.env.POS_PLATFORM_API_KEY || "pos-image-build-key-min-10-chars",
  TENANT_ID: "00000000-0000-4000-8000-000000000099",
  POS_BACKEND_URL: "http://localhost:8010",
  POS_FRONTEND_URL: "http://localhost:3001",
};

const services = [];
if (!skipBackend) {
  services.push("pos-backend", "pos-bigcapital-worker");
}
if (!BACKEND_ONLY && !skipFrontend) {
  if (FULL_FRONTEND) {
    services.push("pos-frontend");
  } else if (STUB_FRONTEND) {
    const stubDockerfile = path.join(ROOT, "infra", "pos-tenant-stack", "Dockerfile.pos-frontend-stub");
    run(
      "Build stub stockix-pos-frontend:local",
      `docker build -t stockix-pos-frontend:local -f "${stubDockerfile}" "${ROOT}"`,
      ROOT,
    );
  }
}

if (services.length === 0) {
  console.log("[pos:images] Images already present (use --force to rebuild)");
} else {
  run(
    `Compose build ${services.join(", ")}`,
    `docker compose -f "${COMPOSE}" -p stockix-pos-image-build build ${services.join(" ")}`,
    ROOT,
    composeEnv,
  );
}

console.log("\n[pos:images] Verify");
const requiredImages = BACKEND_ONLY
  ? ["stockix-pos-backend:local"]
  : POS_IMAGES;
for (const tag of requiredImages) {
  if (imageExists(tag)) {
    console.log(`[pos:images] ok ${tag}`);
  } else {
    console.error(`[pos:images] missing ${tag}`);
    process.exit(1);
  }
}

console.log("\n[pos:images] Ready for per-tenant provision (stockix-pos-{slug}).");
