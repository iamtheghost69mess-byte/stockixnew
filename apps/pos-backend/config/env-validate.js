/**
 * Startup environment guard for the POS backend.
 *
 * Called by config.js before any service code runs.
 * In production: throws immediately on missing required vars.
 * In development: warns and continues.
 *
 * Each entry: [VAR_NAME, description-for-error-message]
 */
const REQUIRED_IN_PRODUCTION = [
  ["JWT_SECRET",             "JWT signing key for POS user tokens (min 32 chars)"],
  ["PLATFORM_JWT_SECRET",   "Platform JWT signing key shared with control plane"],
  ["AUTH_TOKEN_SECRET",     "Stockix control-plane shared secret (must match API)"],
  ["MONGODB_URI",           "Per-tenant MongoDB connection string"],
  ["REDIS_URL",             "Redis connection URL for BullMQ job queues"],
  ["PUBLIC_APP_URL",        "POS frontend base URL — used for CORS and QR codes"],
  ["TENANT_ID",             "Stockix tenant UUID assigned at provisioning"],
  ["LICENSE_SIGNING_SECRET","License verification signing key (must match API)"],
];

const RECOMMENDED_IN_PRODUCTION = [
  ["FIELD_ENCRYPTION_KEY",  "AES-256 base64 key for encrypting PII fields at rest"],
  ["CONTROL_PLANE_INTERNAL_URL", "Control-plane API URL for internal callbacks (required when INTERNAL_API_SECRET is set)"],
];

if (process.env.NODE_ENV === "production") {
  const errors = [];
  for (const [key, description] of REQUIRED_IN_PRODUCTION) {
    if (!process.env[key]?.trim()) {
      errors.push(`  • ${key.padEnd(30)} ${description}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `[pos-backend] Missing required production environment variables:\n\n` +
      errors.join("\n") +
      `\n\nSet these in infra/pos-tenant-stack/docker-compose.yml → environment section.\n`
    );
  }

  const warnings = [];
  for (const [key, description] of RECOMMENDED_IN_PRODUCTION) {
    if (!process.env[key]?.trim()) {
      warnings.push(`  [pos-backend] WARN: ${key} not set — ${description}`);
    }
  }
  for (const w of warnings) console.warn(w);
} else {
  const missing = REQUIRED_IN_PRODUCTION.filter(([k]) => !process.env[k]?.trim());
  if (missing.length > 0) {
    console.warn(
      `[pos-backend] WARN: ${missing.length} required production var(s) not set in dev: ` +
      missing.map(([k]) => k).join(", ")
    );
    console.warn(`  Run: pnpm bootstrap:env && pnpm env:align-local`);
  }
}
