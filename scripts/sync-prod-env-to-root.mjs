#!/usr/bin/env node
/**
 * Sync infra/prod/.env → repo root .env (server deploy only).
 *
 * Why: the provisioning worker reads @repo/config from the mounted repo root.
 * Tenant .env files inherit MAIL_* and INTERNAL_API_SECRET from that loader
 * when not fully injected by Compose.
 *
 * Usage (on production server only):
 *   node scripts/sync-prod-env-to-root.mjs --confirm-server
 *
 * Never run on a developer laptop unless you intend to overwrite local .env.
 */
import { copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const prodEnv = join(repoRoot, "infra", "prod", ".env");
const rootEnv = join(repoRoot, ".env");

const confirm = process.argv.includes("--confirm-server");

if (!confirm) {
  console.error(
    "Refusing to sync: pass --confirm-server when running on the production host.",
  );
  console.error("  node scripts/sync-prod-env-to-root.mjs --confirm-server");
  process.exit(1);
}

if (!existsSync(prodEnv)) {
  console.error(`Missing ${prodEnv}`);
  console.error("Create it from: cp infra/prod/.env.example infra/prod/.env");
  process.exit(1);
}

copyFileSync(prodEnv, rootEnv);
console.log(`Synced ${prodEnv}`);
console.log(`     → ${rootEnv}`);
console.log("Restart api and infra-worker containers to pick up changes.");
