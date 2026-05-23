const path = require("path");
// Always load backend `.env` from this package root (not `process.cwd()`), so PIN
// lookup HMAC and JWT signing use the same secret when started via Nx/monorepo.
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const jwtSecret = process.env.JWT_SECRET;
/** HMAC key for `pinLookup` on PIN-only users; must match value used when users were saved. */
const pinLookupHmacKey = process.env.PIN_LOOKUP_SECRET || jwtSecret;
const refreshSecret =
  process.env.JWT_REFRESH_SECRET ||
  (jwtSecret ? `${jwtSecret}:refresh` : undefined);

const platformJwtSecret =
  process.env.PLATFORM_JWT_SECRET ||
  (process.env.NODE_ENV !== "production" && jwtSecret
    ? `${jwtSecret}:platform`
    : undefined);
const platformRefreshSecret =
  process.env.PLATFORM_JWT_REFRESH_SECRET ||
  (platformJwtSecret ? `${platformJwtSecret}:refresh` : undefined);

const redisUrl = process.env.REDIS_URL || "";
const resendApiKey = process.env.RESEND_API_KEY || "";
const sentryDsn = process.env.SENTRY_DSN || "";
const fieldEncryptionKeyB64 = process.env.FIELD_ENCRYPTION_KEY || "";
const impersonationEnabled =
  String(process.env.PLATFORM_IMPERSONATION_ENABLED || "").toLowerCase() ===
  "true";

const publicAppUrl =
  process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:5173";

/** Browser origins allowed for credentialed CORS + Socket.IO (comma-separated in .env). */
const defaultCorsOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5175",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3010",
  "http://127.0.0.1:3010",
  publicAppUrl,
];
/** Env entries are merged with defaults so one custom port does not drop Next/Vite origins. */
const corsOriginsFromEnv = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [];
const corsOrigins = [...new Set([...defaultCorsOrigins, ...corsOriginsFromEnv])];

function isWildcardPosOrigin(origin) {
  try {
    const url = new URL(String(origin));
    const host = String(url.hostname || "").toLowerCase();
    if (host.endsWith(".localhost")) {
      const slug = host.slice(0, host.length - ".localhost".length);
      return Boolean(slug && !slug.includes("."));
    }
    if (!host.endsWith(".pos.zerowix.cloud")) return false;
    const slug = host.slice(0, host.length - ".pos.zerowix.cloud".length);
    return Boolean(slug);
  } catch {
    return false;
  }
}

const config = Object.freeze({
  port: process.env.PORT || 3000,
  databaseURI: process.env.MONGODB_URI || "mongodb://localhost:27017/pos-db",
  nodeEnv: process.env.NODE_ENV || "development",
  /**
   * Local dev only: `SameSite=None; Secure` not used (http). Chrome often allows this for localhost
   * so cookies are sent on credentialed fetches from another port (e.g. Next :3000 → API :8010).
   */
  posDevCrossSiteCookies:
    (process.env.NODE_ENV || "development") !== "production" &&
    String(process.env.POS_DEV_CROSS_SITE_COOKIES || "").toLowerCase() === "true",
  corsOrigins,
  accessTokenSecret: jwtSecret,
  pinLookupHmacKey,
  /** Optional: verify tokens signed before rotation. */
  accessTokenSecretPrevious: process.env.JWT_SECRET_PREVIOUS || null,
  refreshTokenSecret: refreshSecret,
  refreshTokenSecretPrevious: process.env.JWT_REFRESH_SECRET_PREVIOUS || null,
  accessTokenExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  platformAccessTokenSecret: platformJwtSecret,
  platformAccessTokenSecretPrevious:
    process.env.PLATFORM_JWT_SECRET_PREVIOUS || null,
  platformRefreshTokenSecret: platformRefreshSecret,
  platformRefreshTokenSecretPrevious:
    process.env.PLATFORM_JWT_REFRESH_SECRET_PREVIOUS || null,
  platformAccessTokenExpiresIn:
    process.env.PLATFORM_JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || "1d",
  platformRefreshTokenExpiresIn:
    process.env.PLATFORM_JWT_REFRESH_EXPIRES_IN ||
    process.env.JWT_REFRESH_EXPIRES_IN ||
    "7d",
  redisUrl,
  resendApiKey,
  resendFromEmail:
    process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
  sentryDsn,
  fieldEncryptionKeyB64,
  impersonationEnabled,
  /** Error budget target ratio (0–1) for SLO stub metrics. */
  sloAvailabilityTarget: Number.parseFloat(
    process.env.SLO_AVAILABILITY_TARGET || "0.999"
  ),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpaySecretKey: process.env.RAZORPAY_KEY_SECRET,
  razorpyWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  /** Base URL of the POS web app (used in table QR codes → self-order). */
  publicAppUrl,
  /** Tenant app origin for invitation emails (accept invite links). Defaults to publicAppUrl. */
  tenantAppOrigin:
    (process.env.TENANT_APP_ORIGIN || publicAppUrl || "").replace(/\/$/, "") ||
    "http://localhost:5173",
  /** When true, tenant rate-limit keys are prefixed with `org:{id}:`. */
  rateLimitOrgScopedKeys:
    String(process.env.RATE_LIMIT_ORG_KEYS || "").toLowerCase() === "true",
  /** Extra allowed browser origins for platform admin API (comma-separated). Merged into CORS allowlist. */
  platformCorsOrigins: process.env.PLATFORM_CORS_ORIGINS
    ? process.env.PLATFORM_CORS_ORIGINS.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [],
  /** License gate mode: `enforce` blocks tenant runtime, `shadow` logs only. */
  licenseEnforcementMode: (() => {
    const mode = String(process.env.LICENSE_ENFORCEMENT_MODE || "enforce")
      .trim()
      .toLowerCase();
    return mode === "shadow" ? "shadow" : "enforce";
  })(),
  /** Stockix control-plane tenant UUID (set per tenant POS stack via `TENANT_ID`). */
  stockixTenantId: process.env.TENANT_ID
    ? String(process.env.TENANT_ID).trim()
    : null,
  isWildcardPosOrigin,
});

module.exports = config;
