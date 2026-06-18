#!/usr/bin/env node
/**
 * Backfill MAIL_* environment variables into all provisioned tenant .env files.
 *
 * Problem: When MAIL_* vars are added or changed in infra/prod/.env after tenants are
 * already provisioned, those tenants retain their original (empty) mail config.
 * This script patches each tenant's .env file without touching any other variables.
 *
 * Source of truth (in priority order):
 *   1. infra/prod/.env  (prod server)
 *   2. root .env        (dev / fallback)
 *   3. process.env      (if running inside the worker container)
 *
 * Usage:
 *   # Dry run — show what would change
 *   node scripts/sync-tenant-mail-env.mjs --dry-run
 *
 *   # Fill only tenants that have empty MAIL_* values (safe default)
 *   node scripts/sync-tenant-mail-env.mjs
 *
 *   # Overwrite MAIL_* in ALL tenants even if already set
 *   node scripts/sync-tenant-mail-env.mjs --force
 *
 *   # Target a specific tenant slug
 *   node scripts/sync-tenant-mail-env.mjs --slug=acme
 *
 * On the production server (repo mounted at /opt/stockix/stockixnew):
 *   cd /opt/stockix/stockixnew
 *   node scripts/sync-tenant-mail-env.mjs --dry-run
 *   node scripts/sync-tenant-mail-env.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const slugArg = process.argv.find((a) => a.startsWith("--slug="))?.split("=")[1]?.trim();

// ── Resolve the tenant env root ──────────────────────────────────────────────
const tenantEnvRoot =
  process.env.TENANT_ENV_ROOT?.trim() || "/opt/stockix/tenants";

// ── MAIL keys we manage ──────────────────────────────────────────────────────
const MAIL_KEYS = [
  "MAIL_HOST",
  "MAIL_PORT",
  "MAIL_USERNAME",
  "MAIL_PASSWORD",
  "MAIL_SECURE",
  "MAIL_FROM_NAME",
  "MAIL_FROM_ADDRESS",
  "MAIL_TRANSPORT",
];

// ── Parse a dotenv file into a Map (preserves order via lines array) ─────────
function parseEnvFile(text) {
  const map = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    map.set(key, value);
  }
  return { lines, map };
}

// ── Serialize: patch changed keys in-place, append new keys at end ──────────
function serializeWithPatches(lines, map, patched) {
  const out = [];
  const written = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      out.push(line);
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (patched.has(key)) {
      out.push(`${key}=${map.get(key)}`);
      written.add(key);
    } else {
      out.push(line);
    }
  }
  for (const key of patched) {
    if (!written.has(key)) out.push(`${key}=${map.get(key)}`);
  }
  return out.join("\n").replace(/\n?$/, "\n");
}

// ── Atomic write: write to .tmp then rename ──────────────────────────────────
function writeAtomic(filePath, content) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

// ── Read MAIL_* from the platform env sources ────────────────────────────────
function readPlatformMailConfig() {
  const prodEnvPath = path.join(repoRoot, "infra", "prod", ".env");
  const rootEnvPath = path.join(repoRoot, ".env");

  // Start with process.env (e.g. when running inside the worker container)
  const result = {};
  for (const key of MAIL_KEYS) {
    const v = process.env[key]?.trim();
    if (v) result[key] = v;
  }

  // Layer: root .env (lower priority, only fills gaps)
  for (const envPath of [rootEnvPath, prodEnvPath]) {
    if (!fs.existsSync(envPath)) continue;
    const { map } = parseEnvFile(fs.readFileSync(envPath, "utf8"));
    for (const key of MAIL_KEYS) {
      if (result[key]) continue; // already have a value from higher priority source
      const v = map.get(key)?.trim();
      if (v) result[key] = v;
    }
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const platformMail = readPlatformMailConfig();

const configured = MAIL_KEYS.filter((k) => platformMail[k]);
const missing = MAIL_KEYS.filter((k) => !platformMail[k]);

console.log(`\nPlatform MAIL config:`);
for (const key of MAIL_KEYS) {
  const val = platformMail[key];
  if (!val) {
    console.log(`  ${key} = (not set)`);
  } else if (key === "MAIL_PASSWORD") {
    console.log(`  ${key} = ${"*".repeat(Math.min(val.length, 8))} (redacted)`);
  } else {
    console.log(`  ${key} = ${val}`);
  }
}

if (configured.length === 0) {
  console.error(
    "\n[error] No MAIL_* vars found in infra/prod/.env, root .env, or process.env.\n" +
    "        Set MAIL_HOST, MAIL_PASSWORD, and MAIL_FROM_ADDRESS first, then re-run.\n",
  );
  process.exit(1);
}

if (missing.length > 0) {
  console.warn(`\n[warn] Some MAIL vars are unset: ${missing.join(", ")}`);
  console.warn("       These will be skipped (existing tenant values preserved).");
}

// ── Enumerate tenant dirs ────────────────────────────────────────────────────
if (!fs.existsSync(tenantEnvRoot)) {
  console.error(`\n[error] TENANT_ENV_ROOT not found: ${tenantEnvRoot}`);
  console.error("        Set TENANT_ENV_ROOT env var or run on the production server.");
  process.exit(1);
}

let slugs = fs
  .readdirSync(tenantEnvRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

if (slugArg) {
  if (!slugs.includes(slugArg)) {
    console.error(`[error] Tenant slug not found: ${slugArg} (looked in ${tenantEnvRoot})`);
    process.exit(1);
  }
  slugs = [slugArg];
}

if (slugs.length === 0) {
  console.log("\nNo tenant directories found — nothing to update.");
  process.exit(0);
}

console.log(`\nTenant env root : ${tenantEnvRoot}`);
console.log(`Tenants found   : ${slugs.length} (${slugs.join(", ")})`);
console.log(`Mode            : ${force ? "force (overwrite all)" : "fill-empty-only"}`);
console.log(`Dry run         : ${dryRun ? "yes" : "no"}\n`);

let updated = 0;
let skipped = 0;
let errors = 0;

for (const slug of slugs) {
  const envFile = path.join(tenantEnvRoot, slug, ".env");
  if (!fs.existsSync(envFile)) {
    console.log(`  [${slug}] SKIP — .env not found`);
    skipped++;
    continue;
  }

  let text;
  try {
    text = fs.readFileSync(envFile, "utf8");
  } catch (err) {
    console.error(`  [${slug}] ERROR reading .env: ${err.message}`);
    errors++;
    continue;
  }

  const { lines, map } = parseEnvFile(text);
  const patched = new Set();
  const changes = [];

  for (const key of MAIL_KEYS) {
    const newValue = platformMail[key];
    if (!newValue) continue; // skip keys we don't have in platform config

    const existing = map.get(key)?.trim() ?? "";
    if (existing && !force) continue; // already set and not forcing

    if (existing === newValue) continue; // no change

    changes.push({ key, old: existing || "(empty)", next: key === "MAIL_PASSWORD" ? "(redacted)" : newValue });
    map.set(key, newValue);
    patched.add(key);
  }

  if (patched.size === 0) {
    console.log(`  [${slug}] OK — all MAIL_* already set`);
    skipped++;
    continue;
  }

  console.log(`  [${slug}] ${dryRun ? "would update" : "updating"} (${patched.size} keys):`);
  for (const { key, old: oldVal, next: nextVal } of changes) {
    console.log(`    ${key}: "${oldVal}" → "${nextVal}"`);
  }

  if (!dryRun) {
    try {
      const next = serializeWithPatches(lines, map, patched);
      writeAtomic(envFile, next);
      updated++;
    } catch (err) {
      console.error(`  [${slug}] ERROR writing .env: ${err.message}`);
      errors++;
    }
  } else {
    updated++;
  }
}

console.log(`\nDone — updated: ${updated}, skipped: ${skipped}, errors: ${errors}`);

if (dryRun && updated > 0) {
  console.log("\nRe-run without --dry-run to apply changes.");
}

if (updated > 0 && !dryRun) {
  console.log(
    "\nNext step: restart affected tenant stacks so the new MAIL_* vars take effect:\n" +
    "  docker compose -p stockix-{slug} up -d\n" +
    "Or restart all at once (find all running tenant stacks):\n" +
    "  docker ps --filter 'name=stockix-' --format '{{.Names}}' | grep -oP 'stockix-\\K[^-]+(?=-server)' | sort -u \\\n" +
    "    | xargs -I{} docker compose -p stockix-{} up -d",
  );
}
