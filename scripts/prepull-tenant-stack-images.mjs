#!/usr/bin/env node
/**
 * Warms the Docker image cache for the Stockix tenant stack (BigCapital).
 * Run before first provision in CI or on a new host to avoid long pulls during provision.
 *
 * Does not build local `build:` services (nginx, mysql, etc.) — use
 * `docker compose -f infra/tenant-stack/docker-compose.yml build` for those.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const composeFile = path.join(root, "infra/tenant-stack/docker-compose.yml");
const bigcapitalDefault = path.join(root, "services/bigcapital");

const bigcapitalRoot =
  process.env.BIGCAPITAL_ROOT?.trim() || bigcapitalDefault;

if (!existsSync(composeFile)) {
  console.error("Missing:", composeFile);
  process.exit(1);
}
if (!existsSync(bigcapitalRoot)) {
  console.error(
    "BIGCAPITAL_ROOT not found. Clone vendored BigCapital or set BIGCAPITAL_ROOT.",
    bigcapitalRoot,
  );
  process.exit(1);
}

const env = {
  ...process.env,
  BIGCAPITAL_ROOT: bigcapitalRoot,
  PUBLIC_PROXY_PORT: process.env.PUBLIC_PROXY_PORT || "39999",
};

const pullArgs = [
  "compose",
  "-f",
  composeFile,
  "pull",
  "webapp",
  "server",
];

console.log("docker", pullArgs.join(" "));
try {
  execFileSync("docker", pullArgs, {
    env,
    cwd: root,
    stdio: "inherit",
  });
  console.log("Pull finished OK.");
} catch {
  process.exit(1);
}
