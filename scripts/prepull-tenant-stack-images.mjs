#!/usr/bin/env node
/**
 * Before first provision: pull external base images, optionally pull Stockix BC images from your registry,
 * then build anything still missing locally (unless STOCKIX_BC_SKIP_LOCAL_BUILD=1).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const pullScript = path.join(root, "scripts/stockix-docker-pull.mjs");
const buildScript = path.join(root, "scripts/build-stockix-tenant-images.mjs");
const bigcapitalDefault = path.join(root, "services/bigcapital");

const bigcapitalRoot =
  process.env.BIGCAPITAL_ROOT?.trim() || bigcapitalDefault;

if (!existsSync(path.join(root, "infra/tenant-stack/docker-compose.yml"))) {
  console.error("Missing infra/tenant-stack/docker-compose.yml");
  process.exit(1);
}
if (!existsSync(bigcapitalRoot)) {
  console.error(
    "BIGCAPITAL_ROOT not found:",
    bigcapitalRoot,
  );
  process.exit(1);
}

const env = {
  ...process.env,
  BIGCAPITAL_ROOT: bigcapitalRoot,
  PUBLIC_PROXY_PORT: process.env.PUBLIC_PROXY_PORT || "39999",
};

console.log("node scripts/stockix-docker-pull.mjs");
execFileSync(process.execPath, [pullScript], {
  env,
  cwd: root,
  stdio: "inherit",
});

if (process.env.STOCKIX_BC_SKIP_LOCAL_BUILD === "1") {
  console.log("STOCKIX_BC_SKIP_LOCAL_BUILD=1 — skipping local docker compose build.");
  console.log("Provision cache warm finished OK.");
  process.exit(0);
}

console.log("node scripts/build-stockix-tenant-images.mjs");
try {
  execFileSync(process.execPath, [buildScript], {
    env,
    cwd: root,
    stdio: "inherit",
  });
} catch {
  process.exit(1);
}

console.log("Provision cache warm finished OK.");
