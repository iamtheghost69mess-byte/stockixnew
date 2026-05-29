#!/usr/bin/env node
/**
 * Copy shared Stockix ↔ POS secrets from repo root `.env` into POS backend `.env`.
 *
 * Required for local POS runs: AUTH_TOKEN_SECRET, POS_PLATFORM_API_KEY
 * (see services/posnew/apps/pos-backend/.env.example)
 *
 * Usage:
 *   node scripts/sync-pos-env-from-root.mjs
 *   node scripts/sync-pos-env-from-root.mjs --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootEnvPath = path.join(repoRoot, ".env");
const posEnvPath = path.join(repoRoot, "services", "posnew", "apps", "pos-backend", ".env");
const dryRun = process.argv.includes("--dry-run");

const SYNC_KEYS = ["AUTH_TOKEN_SECRET", "POS_PLATFORM_API_KEY"];

function parseEnv(text) {
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

function upsertEnvFile(filePath, updates) {
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const { lines, map } = parseEnv(text);
  const changed = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!value) continue;
    const prev = map.get(key) ?? "";
    if (prev === value) continue;
    map.set(key, value);
    changed.push(key);
  }

  if (changed.length === 0) return { changed: [], next: text };

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
    if (map.has(key) && SYNC_KEYS.includes(key)) {
      out.push(`${key}=${map.get(key)}`);
      written.add(key);
    } else {
      out.push(line);
    }
  }

  for (const key of SYNC_KEYS) {
    if (map.has(key) && !written.has(key)) {
      out.push(`${key}=${map.get(key)}`);
      written.add(key);
    }
  }

  const next = out.join("\n").replace(/\n?$/, "\n");
  return { changed, next };
}

if (!fs.existsSync(rootEnvPath)) {
  console.error("Missing root .env — run pnpm bootstrap:env first.");
  process.exit(1);
}

const root = parseEnv(fs.readFileSync(rootEnvPath, "utf8")).map;
const updates = {};
const missing = [];

for (const key of SYNC_KEYS) {
  const value = root.get(key)?.trim() ?? "";
  if (!value) missing.push(key);
  else updates[key] = value;
}

if (missing.length > 0) {
  console.error(`Root .env missing required keys: ${missing.join(", ")}`);
  process.exit(1);
}

const { changed, next } = upsertEnvFile(posEnvPath, updates);

if (changed.length === 0) {
  console.log("POS backend .env already aligned with root for:", SYNC_KEYS.join(", "));
  process.exit(0);
}

if (dryRun) {
  console.log("[dry-run] Would update POS .env keys:", changed.join(", "));
  process.exit(0);
}

fs.mkdirSync(path.dirname(posEnvPath), { recursive: true });
fs.writeFileSync(posEnvPath, next, "utf8");
console.log("Updated services/posnew/apps/pos-backend/.env keys:", changed.join(", "));
