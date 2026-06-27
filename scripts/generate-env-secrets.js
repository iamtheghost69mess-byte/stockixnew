#!/usr/bin/env node
/**
 * Print cryptographically secure values for all secret fields across the platform.
 *
 * Usage:
 *   node scripts/generate-env-secrets.js              # print to stdout
 *   node scripts/generate-env-secrets.js --section=cp # control-plane only
 *   node scripts/generate-env-secrets.js --section=pos # POS only
 *
 * Paste the output into the relevant .env file (root .env or infra/prod/.env).
 * Never commit these values — .env files are gitignored.
 */
const crypto = require("crypto");

const section = (() => {
  const arg = process.argv.find((a) => a.startsWith("--section="));
  return arg ? arg.split("=")[1] : "all";
})();

function hex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

function b64(bytes) {
  return crypto.randomBytes(bytes).toString("base64");
}

function localPassword() {
  const adjectives = ["Alpha", "Beta", "Delta", "Sigma", "Omega"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  return `LocalDev@${adj}${hex(4)}`;
}

const sections = {
  cp: () => {
    console.log("# ── Control Plane & Worker ───────────────────────────────");
    console.log("AUTH_TOKEN_SECRET=" + hex(64));
    console.log("SESSION_SECRET=" + hex(64));
    console.log("PLATFORM_API_SECRET=" + hex(64));
    console.log("WORKER_SECRET=" + hex(32));
    console.log("DEPLOYMENT_SECRET_KEY=" + hex(32));
    console.log("INTERNAL_API_SECRET=" + hex(32));
    console.log("LICENSE_SIGNING_SECRET=" + hex(32));
    console.log("BOOTSTRAP_ADMIN_PASSWORD=" + localPassword());
    console.log("PLATFORM_ADMIN_PASSWORD=" + localPassword());
    console.log("POSTGRES_PASSWORD=" + localPassword());
  },

  pos: () => {
    console.log("# ── POS Backend (per-tenant stack) ───────────────────────");
    console.log("JWT_SECRET=" + hex(64));
    console.log("PLATFORM_JWT_SECRET=" + hex(64));
    console.log("PIN_LOOKUP_SECRET=" + hex(32));
    // FIELD_ENCRYPTION_KEY must be exactly 32 bytes (256-bit AES key), base64-encoded
    console.log("FIELD_ENCRYPTION_KEY=" + b64(32));
  },

  finance: () => {
    console.log("# ── Finance / Bigcapital (per-tenant stack) ──────────────");
    console.log("JWT_SECRET=" + hex(64));
  },

  infra: () => {
    console.log("# ── Infrastructure ───────────────────────────────────────");
    console.log("PROXYSQL_ADMIN_USER=proxyadmin");
    console.log("PROXYSQL_ADMIN_PASSWORD=" + hex(16));
    console.log("CHATWOOT_SECRET_KEY_BASE=" + hex(64));
    console.log("CHATWOOT_DB_PASSWORD=" + localPassword());
  },
};

if (section === "all") {
  sections.cp();
  console.log();
  sections.pos();
  console.log();
  sections.finance();
  console.log();
  sections.infra();
} else if (sections[section]) {
  sections[section]();
} else {
  console.error(`Unknown section: ${section}. Use: cp, pos, finance, infra, or omit for all.`);
  process.exit(1);
}
