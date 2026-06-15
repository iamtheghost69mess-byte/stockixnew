#!/usr/bin/env node
/**
 * Fill empty keys in infra/prod/.env from repo root `.env` (dev → prod template).
 *
 * Only writes when the prod value is missing or blank — never overwrites existing prod secrets.
 *
 * Usage:
 *   node scripts/fill-prod-env-gaps.mjs
 *   node scripts/fill-prod-env-gaps.mjs --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootEnvPath = path.join(repoRoot, ".env");
const prodEnvPath = path.join(repoRoot, "infra", "prod", ".env");
const dryRun = process.argv.includes("--dry-run");

/** Keys safe to copy from local root when prod is empty (operator must rotate for real prod). */
const FILL_FROM_ROOT = [
  "POS_PLATFORM_API_KEY",
];

/** Prod defaults when key is absent entirely (Docker-on-host layout). */
const PROD_DEFAULTS = {
  POS_FINANCE_INTERNAL_HOST: "host.docker.internal",
  STOCKIX_FINANCE_INTERNAL_HOST: "host.docker.internal",
};

function parseEnvLines(text) {
  const map = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1));
  }
  return { lines, map };
}

function upsertEmptyOnly(filePath, updates) {
  const text = fs.readFileSync(filePath, "utf8");
  const { lines, map } = parseEnvLines(text);
  const changed = [];

  for (const [key, value] of Object.entries(updates)) {
    const current = map.get(key)?.trim() ?? "";
    if (current) continue;
    if (!value) continue;
    map.set(key, value);
    changed.push(key);
  }

  if (changed.length === 0) return { changed, next: text };

  const out = [];
  const written = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      out.push(line);
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (changed.includes(key)) {
      out.push(`${key}=${map.get(key)}`);
      written.add(key);
    } else {
      out.push(line);
    }
  }

  for (const key of changed) {
    if (!written.has(key)) out.push(`${key}=${map.get(key)}`);
  }

  return { changed, next: out.join("\n").replace(/\n?$/, "\n") };
}

if (!fs.existsSync(rootEnvPath) || !fs.existsSync(prodEnvPath)) {
  console.error("Missing .env or infra/prod/.env");
  process.exit(1);
}

const root = parseEnvLines(fs.readFileSync(rootEnvPath, "utf8")).map;
const prodMap = parseEnvLines(fs.readFileSync(prodEnvPath, "utf8")).map;
const updates = {};
for (const key of FILL_FROM_ROOT) {
  const v = root.get(key)?.trim();
  if (v) updates[key] = v;
}
for (const [key, value] of Object.entries(PROD_DEFAULTS)) {
  if (!prodMap.has(key) || !(prodMap.get(key)?.trim())) {
    updates[key] = value;
  }
}

const { changed, next } = upsertEmptyOnly(prodEnvPath, updates);
if (changed.length === 0) {
  console.log("infra/prod/.env has no empty fillable keys from root.");
  process.exit(0);
}

if (dryRun) {
  console.log("[dry-run] Would fill infra/prod/.env:", changed.join(", "));
  process.exit(0);
}

fs.writeFileSync(prodEnvPath, next, "utf8");
console.log("Filled infra/prod/.env from root (empty only):", changed.join(", "));
