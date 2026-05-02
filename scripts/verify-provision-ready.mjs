#!/usr/bin/env node
/**
 * Non-destructive checks before you rebuild BigCapital images or run full provisioning.
 * Does NOT build Docker images and does NOT create tenants.
 *
 *   pnpm verify:provision-ready
 *
 * Order: platform Postgres up → API running → this script → then `pnpm images:fresh` / provision-smoke.
 */
import { execFileSync, execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function runNode(scriptRel, args = []) {
  execFileSync(process.execPath, [join(repoRoot, scriptRel), ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
}

console.error("\n=== 1/2 provision:preflight ===\n");
runNode("scripts/provision-preflight.mjs");

console.error("\n=== 2/2 provision-smoke (dry: /health + /owners only) ===\n");
// cwd for exec/run is apps/api — use package.json script path `scripts/...`, not `apps/api/scripts/...`
execSync("pnpm --filter api run provision-smoke", {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
  shell: true,
});

console.error(`
=== verify:provision-ready passed ===
Next (when you choose): rebuild images (e.g. pnpm images:fresh), then optional full test:
  pnpm --filter api run provision-smoke -- --full
`);
