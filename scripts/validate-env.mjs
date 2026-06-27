#!/usr/bin/env node
/**
 * Pre-start environment validator.
 *
 * Checks that all vars the platform REQUIRES to start are present.
 * Two tiers:
 *   DEV_MINIMUM  — must be set for `pnpm dev` to work at all
 *   PROD_REQUIRED — full list required for production
 *
 * Usage:
 *   node scripts/validate-env.mjs              # dev check, warn only (exit 0)
 *   node scripts/validate-env.mjs --strict     # exit 1 on any missing
 *   node scripts/validate-env.mjs --prod       # validate infra/prod/.env strictly
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict") || process.env.NODE_ENV === "production";
const useProd = process.argv.includes("--prod");

const envFile = useProd ? "infra/prod/.env" : ".env";

// ─── Required var lists ────────────────────────────────────────────────────

/**
 * Must be set for local `pnpm dev` (control-plane API + worker) to function.
 * Derived from packages/config/src/env.ts — only the non-optional, non-defaulted vars.
 */
const DEV_MINIMUM = [
  // Core security — cannot be derived or defaulted
  "AUTH_TOKEN_SECRET",
  "SESSION_SECRET",
  "PLATFORM_API_SECRET",
  "WORKER_SECRET",
  "DEPLOYMENT_SECRET_KEY",
  "LICENSE_SIGNING_SECRET",
  // Databases — required for any API call to work
  "DATABASE_URL",
  "TENANT_REDIS_HOST",
  "SHARED_MONGO_HOST",
  "SHARED_MYSQL_HOST",
  "MYSQL_PROXY_HOST",
  "MYSQL_PROXY_PORT",
  "WORKER_MYSQL_PROXY_PORT",
  "PROXYSQL_ADMIN_USER",
  "PROXYSQL_ADMIN_PASSWORD",
  // Multi-tenant infrastructure
  "TENANT_ENV_ROOT",
  "TENANT_INTERNAL_HOST",
  "WORKER_INTERNAL_NETWORK",
  "WORKER_CONCURRENCY",
  "WORKER_HEALTH_PORT",
];

/**
 * Additional vars required in production but can be missing in local dev.
 */
const PROD_ONLY_REQUIRED = [
  "ROOT_DOMAIN",
  "TRAEFIK_DYNAMIC_DIR",
  "TRAEFIK_TENANT_UPSTREAM_HOST",
  "DATABASE_URL",          // must not use localhost default
  "CF_DNS_API_TOKEN",      // TLS certificate provisioning
  "PUBLIC_BASE_URL_SCHEME", // must be "https" in production
];

// ─── Parse env files ────────────────────────────────────────────────────────

function parseEnvFile(relPath) {
  const full = path.join(repoRoot, relPath);
  if (!fs.existsSync(full)) return new Map();
  const map = new Map();
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    map.set(k, v);
  }
  return map;
}

const env = parseEnvFile(envFile);
const envLocal = parseEnvFile(".env.local");

function currentValue(key) {
  return envLocal.get(key) ?? env.get(key) ?? "";
}

const checkList = useProd
  ? [...new Set([...DEV_MINIMUM, ...PROD_ONLY_REQUIRED])]
  : DEV_MINIMUM;

const missing = checkList.filter((k) => !currentValue(k).trim());

// ─── Report ─────────────────────────────────────────────────────────────────
const line = "─".repeat(56);
console.log(`\n┌${line}┐`);
console.log(`│        Environment Validation — Stockix Platform       │`);
console.log(`└${line}┘\n`);

const envLabel = useProd ? "infra/prod/.env" : ".env";
const mode = useProd ? "production" : "development";
console.log(`  Mode     : ${mode}`);
console.log(`  Checking : ${envLabel}${envLocal.size > 0 ? " + .env.local" : ""}`);
console.log(`  Required : ${checkList.length} vars\n`);

if (missing.length === 0) {
  console.log(`  ✓  All ${checkList.length} required vars are set\n`);
  console.log(`  PASS — environment is ready for ${mode}\n`);
  process.exit(0);
}

console.log(`  ✗  Missing required vars (${missing.length}):\n`);
for (const k of missing) {
  console.log(`       ✗  ${k}`);
}

console.log(`
  Quickfix:
    pnpm bootstrap:env          — copy defaults from .env.example
    pnpm env:secrets            — generate cryptographic secrets
    pnpm env:align-local        — fill internal host / POS port keys
    pnpm env:audit              — full alignment check (root ↔ POS ↔ prod)
`);

if (strict) {
  console.log(`  FAIL — ${missing.length} required var(s) missing (--strict)\n`);
  process.exit(1);
} else {
  console.log(`  WARN — ${missing.length} required var(s) missing`);
  console.log(`  (pass --strict to block startup on missing vars)\n`);
  process.exit(0);
}
