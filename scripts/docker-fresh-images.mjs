#!/usr/bin/env node
/**
 * Clean Docker image layers for Stockix BigCapital, then rebuild from BIGCAPITAL_ROOT (canonical path to production).
 *
 * Default (safe): remove local stockix/bigcapital-* for STOCKIX_BC_TAG, prune dangling images, prune build cache,
 * pull third-party bases, run `pnpm images:tenant` (same as build-stockix-tenant-images.mjs).
 *
 *   pnpm images:fresh
 *   pnpm images:fresh -- --minimal
 *
 * Nuclear (every unused image on this machine — requires confirmation):
 *
 *   STOCKIX_CONFIRM_DOCKER_NUKE=1 pnpm images:fresh -- --prune-all-unused-images
 *
 * If images are referenced by running containers, stop those stacks first (`docker compose -p stockix-<slug> down`)
 * or Docker may refuse removal until containers are gone.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertComposeBuildSecrets,
  loadComposeBuildEnv,
} from "./load-compose-build-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function usage() {
  console.log(`Usage: node scripts/docker-fresh-images.mjs [options]

Options:
  --minimal                  Pass through to tenant image build (skip server image)
  --skip-pull                Skip scripts/stockix-docker-pull.mjs
  --keep-builder-cache       Do not run docker builder prune
  --prune-all-unused-images  docker image prune -a (ALL unused images on host — not just Stockix)
  --yes                      Required with --prune-all-unused-images unless STOCKIX_CONFIRM_DOCKER_NUKE=1

Env:
  STOCKIX_CONFIRM_DOCKER_NUKE=1   Acknowledge full image prune (with --prune-all-unused-images)
`);
}

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) {
  usage();
  process.exit(0);
}

const minimal = argv.includes("--minimal");
const skipPull = argv.includes("--skip-pull");
const keepBuilderCache = argv.includes("--keep-builder-cache");
const pruneAllUnused = argv.includes("--prune-all-unused-images");
const yes =
  argv.includes("--yes") ||
  String(process.env.STOCKIX_CONFIRM_DOCKER_NUKE || "").trim() === "1";

function runDocker(args, inherit = true) {
  execFileSync("docker", args, {
    stdio: inherit ? "inherit" : "pipe",
    encoding: "utf8",
  });
}

function tryRemoveImage(ref) {
  try {
    execFileSync("docker", ["rmi", "-f", ref], {
      stdio: "pipe",
      encoding: "utf8",
    });
    console.error(`Removed image ${ref}`);
  } catch {
    console.error(`(skip or in use) ${ref}`);
  }
}

const env = loadComposeBuildEnv(repoRoot);
assertComposeBuildSecrets(env);

const tag = String(env.STOCKIX_BC_TAG || "latest").trim() || "latest";
const composeBcImages = [
  `stockix/bigcapital-webapp:${tag}`,
  `stockix/bigcapital-server:${tag}`,
  `stockix/bigcapital-nginx:${tag}`,
  `stockix/bigcapital-migration:${tag}`,
];

console.error("--- Removing Stockix BigCapital images for tag:", tag);
for (const img of composeBcImages) {
  tryRemoveImage(img);
}
// Often developers also have :latest while tag is something else
if (tag !== "latest") {
  for (const base of [
    "stockix/bigcapital-webapp",
    "stockix/bigcapital-server",
    "stockix/bigcapital-nginx",
    "stockix/bigcapital-migration",
  ]) {
    tryRemoveImage(`${base}:latest`);
  }
}

if (pruneAllUnused) {
  if (!yes) {
    console.error(
      "Refusing --prune-all-unused-images without --yes or STOCKIX_CONFIRM_DOCKER_NUKE=1 (removes ALL unused images on this host).",
    );
    process.exit(1);
  }
  console.error(
    "--- docker image prune -a (all unused images on this machine)",
  );
  runDocker(["image", "prune", "-a", "-f"]);
} else {
  console.error("--- docker image prune -f (dangling only)");
  runDocker(["image", "prune", "-f"]);
}

if (!keepBuilderCache) {
  console.error("--- docker builder prune -af (clear build cache — next build is fully fresh)");
  runDocker(["builder", "prune", "-af"]);
}

const pullScript = join(repoRoot, "scripts/stockix-docker-pull.mjs");
const buildScript = join(repoRoot, "scripts/build-stockix-tenant-images.mjs");

if (!skipPull) {
  if (!existsSync(pullScript)) {
    console.error("Missing", pullScript);
    process.exit(1);
  }
  console.error("--- node scripts/stockix-docker-pull.mjs");
  execFileSync(process.execPath, [pullScript], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

const buildArgv = [buildScript];
if (minimal) buildArgv.push("--minimal");

console.error("--- node scripts/build-stockix-tenant-images.mjs", minimal ? "--minimal" : "");
execFileSync(process.execPath, buildArgv, {
  cwd: repoRoot,
  env: { ...process.env, ...env },
  stdio: "inherit",
});

console.error(
  "\nDone. Canonical images:",
  composeBcImages.join(", "),
  "\nTag/push these for production (same STOCKIX_BC_TAG on the server), or build on the VPS after git pull.",
);
