#!/usr/bin/env node
/**
 * Add POS backend dev vars to root .env if they are missing.
 *
 * POS backend now loads from root .env instead of apps/pos-backend/.env.
 * Run this once after bootstrap to ensure all POS vars are in root .env.
 *
 * Usage:
 *   node scripts/add-pos-dev-vars.mjs
 *   node scripts/add-pos-dev-vars.mjs --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootEnvPath = path.join(repoRoot, ".env");
const dryRun = process.argv.includes("--dry-run");

/** POS-backend-specific vars with safe local development defaults. */
const POS_DEV_VARS = {
  // MongoDB — POS backend uses a per-tenant MongoDB database
  MONGODB_URI: "mongodb://localhost:27017/pos-dev",
  // Redis — same Redis instance as the control plane (dev localhost)
  REDIS_URL: "redis://localhost:6379",
  // POS frontend URL (used for CORS + QR codes in dev)
  PUBLIC_APP_URL: "http://localhost:3001",
  // License enforcement: shadow mode in dev (logs, does not block)
  LICENSE_ENFORCEMENT_MODE: "shadow",
  // Port for the POS backend HTTP server
  POS_BACKEND_PORT: "8010",
  // POS tenant UUID placeholder for local dev
  TENANT_ID: "dev-tenant-local",
  // Platform impersonation (disabled in dev unless needed)
  PLATFORM_IMPERSONATION_ENABLED: "false",
};

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return new Map();
  const map = new Map();
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    map.set(t.slice(0, eq).trim(), t.slice(eq + 1));
  }
  return map;
}

if (!fs.existsSync(rootEnvPath)) {
  console.error("Root .env not found — run `pnpm bootstrap:env` first.");
  process.exit(1);
}

const existing = parseEnvFile(rootEnvPath);
const toAdd = Object.entries(POS_DEV_VARS).filter(([k]) => !existing.has(k));

if (toAdd.length === 0) {
  console.log("✓ Root .env already has all POS dev vars.");
  process.exit(0);
}

if (dryRun) {
  console.log("[dry-run] Would add to root .env:");
  for (const [k, v] of toAdd) console.log(`  ${k}=${v}`);
  process.exit(0);
}

const block =
  "\n# ── POS Backend (dev) — added by scripts/add-pos-dev-vars.mjs ──────────\n" +
  toAdd.map(([k, v]) => `${k}=${v}`).join("\n") +
  "\n";

const current = fs.readFileSync(rootEnvPath, "utf8");
fs.writeFileSync(rootEnvPath, current.replace(/\n?$/, "\n") + block, "utf8");

console.log("✓ Added POS dev vars to root .env:");
for (const [k] of toAdd) console.log(`  + ${k}`);
console.log("\nRoot .env is now the single source for control-plane + POS dev.");
