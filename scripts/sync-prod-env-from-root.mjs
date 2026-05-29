#!/usr/bin/env node
/**
 * Copy empty/missing keys in infra/prod/.env from repo root `.env`.
 * Never overwrites non-empty prod values. Maps S3_* → BACKUP_B2_* when B2 keys are empty.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootEnvPath = path.join(repoRoot, ".env");
const prodEnvPath = path.join(repoRoot, "infra", "prod", ".env");
const dryRun = process.argv.includes("--dry-run");

const COPY_FROM_ROOT = [
  "CF_DNS_API_TOKEN",
  "CHATWOOT_API_ACCESS_TOKEN",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_ENVIRONMENT",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "RESEND_WEBHOOK_SECRET",
  "BACKUP_B2_BUCKET",
  "BACKUP_B2_KEY_ID",
  "BACKUP_B2_APP_KEY",
  "BACKUP_B2_ENDPOINT",
  "BACKUP_B2_PREFIX",
  "BACKUP_RETENTION_DAYS",
];

const B2_FROM_S3 = [
  ["BACKUP_B2_BUCKET", "S3_BUCKET"],
  ["BACKUP_B2_KEY_ID", "S3_ACCESS_KEY_ID"],
  ["BACKUP_B2_APP_KEY", "S3_SECRET_ACCESS_KEY"],
  ["BACKUP_B2_ENDPOINT", "S3_ENDPOINT"],
];

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
    if (!value?.trim()) continue;
    map.set(key, value.trim());
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
const prod = parseEnvLines(fs.readFileSync(prodEnvPath, "utf8")).map;
const updates = {};

for (const key of COPY_FROM_ROOT) {
  const v = root.get(key)?.trim();
  if (v) updates[key] = v;
}

for (const [b2Key, s3Key] of B2_FROM_S3) {
  if (prod.get(b2Key)?.trim()) continue;
  const fromRoot = root.get(b2Key)?.trim() || root.get(s3Key)?.trim();
  const fromProdS3 = prod.get(s3Key)?.trim();
  const value = fromRoot || fromProdS3;
  if (value) updates[b2Key] = value;
}

if (!prod.get("BACKUP_B2_PREFIX")?.trim() && !updates.BACKUP_B2_PREFIX) {
  updates.BACKUP_B2_PREFIX = "stockix-platform-backups";
}
if (!prod.get("BACKUP_RETENTION_DAYS")?.trim() && !updates.BACKUP_RETENTION_DAYS) {
  updates.BACKUP_RETENTION_DAYS = "30";
}
if (!prod.get("BACKUP_POSTGRES_CONTAINER")?.trim()) {
  updates.BACKUP_POSTGRES_CONTAINER = prod.get("BACKUP_POSTGRES_CONTAINER")?.trim()
    || "stockix-postgres-1";
}

const { changed, next } = upsertEmptyOnly(prodEnvPath, updates);
if (changed.length === 0) {
  console.log("infra/prod/.env: no empty keys to fill from root/S3 mapping.");
  process.exit(0);
}

if (dryRun) {
  console.log("[dry-run] Would update:", changed.join(", "));
  process.exit(0);
}

fs.writeFileSync(prodEnvPath, next, "utf8");
console.log("Updated infra/prod/.env:", changed.join(", "));
