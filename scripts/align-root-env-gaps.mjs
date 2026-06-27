#!/usr/bin/env node
/**
 * Add documented root `.env` keys that are missing but have safe defaults in `.env.example`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootEnvPath = path.join(repoRoot, ".env");
const examplePath = path.join(repoRoot, ".env.example");
const dryRun = process.argv.includes("--dry-run");

const DEFAULTS = {
  POS_FINANCE_INTERNAL_HOST: "host.docker.internal",
  STOCKIX_FINANCE_INTERNAL_HOST: "127.0.0.1",
  POS_HOST_PORT: "8010",
  POS_FRONTEND_HOST_PORT: "3001",
  WORKER_HEALTH_PORT: "9090",
  WORKER_CONCURRENCY: "2",
  WORKER_INTERNAL_NETWORK: "stockix_internal",
};

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    map.set(t.slice(0, eq).trim(), t.slice(eq + 1));
  }
  return map;
}

if (!fs.existsSync(rootEnvPath)) {
  console.error("Missing root .env");
  process.exit(1);
}

const example = fs.existsSync(examplePath)
  ? parseEnv(fs.readFileSync(examplePath, "utf8"))
  : new Map();
const rootText = fs.readFileSync(rootEnvPath, "utf8");
const root = parseEnv(rootText);

const toAdd = [];
for (const [key, fallback] of Object.entries(DEFAULTS)) {
  const current = root.get(key)?.trim() ?? "";
  if (current) continue;
  const fromExample = example.get(key)?.trim();
  toAdd.push([key, fromExample || fallback]);
}

if (toAdd.length === 0) {
  console.log("Root .env already has internal host / POS port keys.");
  process.exit(0);
}

const block = toAdd.map(([k, v]) => `${k}=${v}`).join("\n");
const next = `${rootText.replace(/\n?$/, "\n")}\n# Added by scripts/align-root-env-gaps.mjs\n${block}\n`;

if (dryRun) {
  console.log("[dry-run] Would add keys:", toAdd.map(([k]) => k).join(", "));
  process.exit(0);
}

fs.writeFileSync(rootEnvPath, next, "utf8");
console.log("Added to root .env:", toAdd.map(([k]) => k).join(", "));
