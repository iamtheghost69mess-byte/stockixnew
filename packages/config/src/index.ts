import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { z } from "zod";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(configDir, "..", "..", "..");

// Centralized env bootstrapping for all runtime consumers.
// Standard pattern: `.env` (shared defaults) then `.env.local` (machine-specific overrides).
// Skip automatic loading under Vitest so unit tests control `process.env` (no leak from a developer's `.env`).
// Set STOCKIX_LOAD_ROOT_ENV=1 to force-load anyway (e.g. debugging integration-style tests).
const rootEnv = path.join(monorepoRoot, ".env");
const rootEnvLocal = path.join(monorepoRoot, ".env.local");
const loadRootEnvFlag = process.env.STOCKIX_LOAD_ROOT_ENV?.trim().toLowerCase();
const shouldLoadRootDotenv =
  loadRootEnvFlag === "0" || loadRootEnvFlag === "false"
    ? false
    : loadRootEnvFlag === "1" || process.env.VITEST !== "true";
if (shouldLoadRootDotenv) {
  if (existsSync(rootEnv)) {
    loadEnv({ path: rootEnv, override: false });
  }
  if (existsSync(rootEnvLocal)) {
    loadEnv({ path: rootEnvLocal, override: true });
  }
}

const optionalStringSchema = z.string().min(1).optional();
const stringSchema = z.string().min(1);
const numberSchema = z.coerce.number().finite();
const booleanStringSchema = z.enum(["true", "false", "1", "0"]).optional();

function parseValue<T>(
  schema: z.ZodType<T>,
  value: unknown,
  name: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`[config] invalid ${name}: ${result.error.issues.map((i) => i.message).join(", ")}`);
  }
  return result.data;
}

function readOptionalString(name: string): string | undefined {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  return parseValue(optionalStringSchema, normalized.length > 0 ? normalized : undefined, name);
}

function readString(name: string, fallback: string): string {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  const resolved = normalized.length > 0 ? normalized : fallback;
  return parseValue(stringSchema, resolved, name);
}

function readRequiredString(name: string): string {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  return parseValue(stringSchema, normalized, name);
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const resolved = raw === undefined || raw === null || raw === "" ? fallback : raw;
  return parseValue(numberSchema, resolved, name);
}

function readBooleanLike(name: string): "true" | "false" | "1" | "0" | undefined {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return parseValue(booleanStringSchema, normalized.length > 0 ? normalized : undefined, name);
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        throw new Error(`[config] invalid CORS origin: ${origin}`);
      }
    });
}

function validateRequiredEnvForProfile(profile: string) {
  const requiredByProfile: Record<string, string[]> = {
    development: [],
    test: [],
    staging: [
      "DATABASE_URL",
      "PLATFORM_API_SECRET",
      "WORKER_SECRET",
      "SESSION_SECRET",
      "DASHBOARD_URL",
      "AUTH_TOKEN_SECRET",
      "DEPLOYMENT_SECRET_KEY",
      "LICENSE_SIGNING_SECRET",
    ],
    production: [
      "DATABASE_URL",
      "DB_POOL_MAX",
      "DB_IDLE_TIMEOUT_SECONDS",
      "DB_CONNECT_TIMEOUT_SECONDS",
      "DB_MAX_LIFETIME_SECONDS",
      "PLATFORM_API_SECRET",
      "WORKER_SECRET",
      "SESSION_SECRET",
      "DASHBOARD_URL",
      "AUTH_TOKEN_SECRET",
      "DEPLOYMENT_SECRET_KEY",
      "LICENSE_SIGNING_SECRET",
      "CONTROL_PLANE_REDIS_URL",
    ],
  };
  const required = requiredByProfile[profile] ?? requiredByProfile.production ?? [];
  const missing = required.filter((name) => {
    const value = process.env[name];
    return !value || value.trim().length === 0;
  });
  if (missing.length > 0) {
    throw new Error(`[config] missing required env for ${profile}: ${missing.join(", ")}`);
  }
}

export const env = {
  FINANCE_LICENSE_SYNC_OPTIONAL: readOptionalString("FINANCE_LICENSE_SYNC_OPTIONAL"),
  CONTROL_PLANE_REDIS_URL: readOptionalString("CONTROL_PLANE_REDIS_URL"),
  LICENSE_SYNC_STRICT: readOptionalString("LICENSE_SYNC_STRICT"),
  BRAND_NAME: readString("BRAND_NAME", "Stockix"),
  PROVISION_RECONCILE_INTERVAL_MS: readNumber("PROVISION_RECONCILE_INTERVAL_MS", 60_000),
  POS_FRONTEND_URL: readOptionalString("POS_FRONTEND_URL"),
  SENTRY_DSN: readOptionalString("SENTRY_DSN"),
  DATABASE_URL: readOptionalString("DATABASE_URL"),
  DB_WAIT_TIMEOUT_MS: readNumber("DB_WAIT_TIMEOUT_MS", 90_000),
  PORT: readNumber("PORT", 4000),
  PLATFORM_API_SECRET: readOptionalString("PLATFORM_API_SECRET"),
  DASHBOARD_URL: readOptionalString("DASHBOARD_URL"),
  BOOTSTRAP_ADMIN_EMAIL: readOptionalString("BOOTSTRAP_ADMIN_EMAIL"),
  BOOTSTRAP_ADMIN_PASSWORD: readOptionalString("BOOTSTRAP_ADMIN_PASSWORD"),
  ROOT_DOMAIN: readOptionalString("ROOT_DOMAIN"),
  PUBLIC_BASE_URL_SCHEME: readString("PUBLIC_BASE_URL_SCHEME", "http").toLowerCase(),
  MAX_TENANT_PORT: readNumber("MAX_TENANT_PORT", 4999),
  STOCKIX_TENANT_APP_ROOT: readOptionalString("STOCKIX_TENANT_APP_ROOT"),
  REPO_ROOT: readOptionalString("REPO_ROOT"),
  TENANT_ENV_ROOT: readOptionalString("TENANT_ENV_ROOT"),
  TRAEFIK_DYNAMIC_DIR: readString("TRAEFIK_DYNAMIC_DIR", "/opt/stockix/traefik-dynamic"),
  TRAEFIK_TENANT_UPSTREAM_HOST: readString("TRAEFIK_TENANT_UPSTREAM_HOST", "host.docker.internal"),
  TENANT_INTERNAL_HOST: readString("TENANT_INTERNAL_HOST", "127.0.0.1"),
  CORS_ORIGINS: readOptionalString("CORS_ORIGINS"),
  SESSION_SECRET: readOptionalString("SESSION_SECRET"),
  /** HS256 secret for POS offline license JWTs; min 32 chars in staging/production. */
  LICENSE_SIGNING_SECRET: readOptionalString("LICENSE_SIGNING_SECRET"),
  AUTH_TOKEN_SECRET: readOptionalString("AUTH_TOKEN_SECRET"),
  ALLOW_BOOTSTRAP_LOGIN: readBooleanLike("ALLOW_BOOTSTRAP_LOGIN"),
  PLATFORM_ADMIN_EMAIL: readOptionalString("PLATFORM_ADMIN_EMAIL"),
  PLATFORM_ADMIN_PASSWORD: readOptionalString("PLATFORM_ADMIN_PASSWORD"),
  NEXT_PUBLIC_STOCKIX_API_URL: readString("NEXT_PUBLIC_STOCKIX_API_URL", "http://localhost:4000"),
  NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME: readString("NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME", "http"),
  NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN: readString("NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN", "localhost"),
  NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST: readString("NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST", "127.0.0.1"),
  SECURITY_HSTS: readString("SECURITY_HSTS", "max-age=31536000; includeSubDomains"),
  SECURITY_X_FRAME_OPTIONS: readString("SECURITY_X_FRAME_OPTIONS", "DENY"),
  SECURITY_REFERRER_POLICY: readString("SECURITY_REFERRER_POLICY", "strict-origin-when-cross-origin"),
  SECURITY_X_CONTENT_TYPE_OPTIONS: readString("SECURITY_X_CONTENT_TYPE_OPTIONS", "nosniff"),
  SECURITY_CSP_BASE: readString(
    "SECURITY_CSP_BASE",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  ),
  STOCKIX_API_URL: readString("STOCKIX_API_URL", "http://localhost:4000"),
  PROVISION_POLL_MS: readNumber("PROVISION_POLL_MS", 2000),
  PROVISION_MAX_MS: readNumber("PROVISION_MAX_MS", 45 * 60 * 1000),
  OWNER_ID: readOptionalString("OWNER_ID"),
  PROVISION_ADMIN_EMAIL: readString("PROVISION_ADMIN_EMAIL", "admin@localhost"),
  POSTGRES_USER: readOptionalString("POSTGRES_USER"),
  POSTGRES_PASSWORD: readOptionalString("POSTGRES_PASSWORD"),
  POSTGRES_DB: readOptionalString("POSTGRES_DB"),
  POSTGRES_HOST_PORT: readOptionalString("POSTGRES_HOST_PORT"),
  ACME_EMAIL: readOptionalString("ACME_EMAIL"),
  CF_DNS_API_TOKEN: readOptionalString("CF_DNS_API_TOKEN"),
  STOCKIX_REPO: readOptionalString("STOCKIX_REPO"),
  NODE_ENV: readString("NODE_ENV", "development"),
  HOSTNAME: readString("HOSTNAME", "server"),
  PLAYWRIGHT_TEST_BASE_URL: readOptionalString("PLAYWRIGHT_TEST_BASE_URL"),
  SMOKE_OWNER_ID: readOptionalString("SMOKE_OWNER_ID"),
  SIGNUP_DISABLED: readBooleanLike("SIGNUP_DISABLED"),
  SIGNUP_ALLOWED_DOMAINS: readOptionalString("SIGNUP_ALLOWED_DOMAINS"),
  SIGNUP_ALLOWED_EMAILS: readOptionalString("SIGNUP_ALLOWED_EMAILS"),
  BROWSER_WS_ENDPOINT: readOptionalString("BROWSER_WS_ENDPOINT"),
  METRICS_ENDPOINT: readOptionalString("METRICS_ENDPOINT"),
  METRICS_AUTH_TOKEN: readOptionalString("METRICS_AUTH_TOKEN"),
  MONOREPO_VERSION: readOptionalString("MONOREPO_VERSION"),
  PUBLIC_URL: readOptionalString("PUBLIC_URL"),
  WORKER_SECRET: readString("WORKER_SECRET", "dev-worker-secret"),
  RUN_BULLMQ_CONSUMERS: readOptionalString("RUN_BULLMQ_CONSUMERS"),
  /** Shared with stockix-finance for POST /api/internal/* (provisioning attach-user). */
  INTERNAL_API_SECRET: readOptionalString("INTERNAL_API_SECRET"),
  /** Max time (ms) the worker allows a single job to run before aborting (must be >= slow docker image builds). */
  WORKER_JOB_EXECUTION_TIMEOUT_MS: readNumber("WORKER_JOB_EXECUTION_TIMEOUT_MS", 45 * 60 * 1000),
  WORKER_HEARTBEAT_STALE_MS: readNumber("WORKER_HEARTBEAT_STALE_MS", 600_000),
  WORKER_STALE_LEASE_THRESHOLD_MS: readNumber("WORKER_STALE_LEASE_THRESHOLD_MS", 3_000_000),
  /** Max time (ms) for docker compose up/build/pull (first image pull can exceed 5m). */
  DOCKER_COMPOSE_UP_TIMEOUT_MS: readNumber("DOCKER_COMPOSE_UP_TIMEOUT_MS", 30 * 60 * 1000),
  /** Max time (ms) for docker compose run (migrations). */
  DOCKER_COMPOSE_RUN_TIMEOUT_MS: readNumber("DOCKER_COMPOSE_RUN_TIMEOUT_MS", 15 * 60 * 1000),
  /** Max time (ms) for other compose subcommands (down uses a fixed 2m in code). */
  DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS: readNumber("DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS", 10 * 60 * 1000),
  WORKER_JOB_ID: readOptionalString("WORKER_JOB_ID"),
  DB_CLIENT: readOptionalString("DB_CLIENT"),
  DB_HOST: readOptionalString("DB_HOST"),
  DB_USER: readOptionalString("DB_USER"),
  DB_PASSWORD: readOptionalString("DB_PASSWORD"),
  DB_CHARSET: readOptionalString("DB_CHARSET"),
  SYSTEM_DB_CLIENT: readOptionalString("SYSTEM_DB_CLIENT"),
  SYSTEM_DB_HOST: readOptionalString("SYSTEM_DB_HOST"),
  SYSTEM_DB_USER: readOptionalString("SYSTEM_DB_USER"),
  SYSTEM_DB_PASSWORD: readOptionalString("SYSTEM_DB_PASSWORD"),
  SYSTEM_DB_NAME: readOptionalString("SYSTEM_DB_NAME"),
  SYSTEM_DB_CHARSET: readOptionalString("SYSTEM_DB_CHARSET"),
  TENANT_DB_CLIENT: readOptionalString("TENANT_DB_CLIENT"),
  TENANT_DB_NAME_PREFIX: readOptionalString("TENANT_DB_NAME_PREFIX"),
  TENANT_DB_NAME_PERFIX: readOptionalString("TENANT_DB_NAME_PERFIX"),
  TENANT_DB_HOST: readOptionalString("TENANT_DB_HOST"),
  TENANT_DB_USER: readOptionalString("TENANT_DB_USER"),
  TENANT_DB_PASSWORD: readOptionalString("TENANT_DB_PASSWORD"),
  TENANT_DB_CHARSET: readOptionalString("TENANT_DB_CHARSET"),
  MAIL_HOST: readOptionalString("MAIL_HOST"),
  MAIL_PORT: readOptionalString("MAIL_PORT"),
  MAIL_SECURE: readBooleanLike("MAIL_SECURE"),
  MAIL_USERNAME: readOptionalString("MAIL_USERNAME"),
  MAIL_PASSWORD: readOptionalString("MAIL_PASSWORD"),
  DEPLOYMENT_SECRET_KEY: readOptionalString("DEPLOYMENT_SECRET_KEY"),
  MAIL_FROM_NAME: readOptionalString("MAIL_FROM_NAME"),
  MAIL_FROM_ADDRESS: readOptionalString("MAIL_FROM_ADDRESS"),
  RESEND_WEBHOOK_SECRET: readOptionalString("RESEND_WEBHOOK_SECRET"),
  MONGODB_DATABASE_URL: readOptionalString("MONGODB_DATABASE_URL"),
  AGENDA_DB_COLLECTION: readOptionalString("AGENDA_DB_COLLECTION"),
  AGENDA_POOL_TIME: readOptionalString("AGENDA_POOL_TIME"),
  AGENDA_CONCURRENCY: readOptionalString("AGENDA_CONCURRENCY"),
  AGENDASH_AUTH_USER: readOptionalString("AGENDASH_AUTH_USER"),
  AGENDASH_AUTH_PASSWORD: readOptionalString("AGENDASH_AUTH_PASSWORD"),
  EASY_SMS_TOKEN: readOptionalString("EASY_SMS_TOKEN"),
  JWT_SECRET: readOptionalString("JWT_SECRET"),
  BASE_URL: readOptionalString("BASE_URL"),
  THROTTLE_GLOBAL_TTL: readNumber("THROTTLE_GLOBAL_TTL", 60_000),
  THROTTLE_GLOBAL_LIMIT: readNumber("THROTTLE_GLOBAL_LIMIT", 2000),
  THROTTLE_AUTH_TTL: readNumber("THROTTLE_AUTH_TTL", 60_000),
  THROTTLE_AUTH_LIMIT: readNumber("THROTTLE_AUTH_LIMIT", 200),
  npm_package_json: readOptionalString("npm_package_json"),
  npm_package_type: readOptionalString("npm_package_type"),
} as const;

export const mailConfig = {
  host: env.MAIL_HOST ?? '',
  port: parseInt(env.MAIL_PORT ?? '587', 10),
  username: env.MAIL_USERNAME ?? '',
  password: env.MAIL_PASSWORD ?? '',
  secure: env.MAIL_SECURE === 'true' || env.MAIL_SECURE === '1',
  fromName: env.MAIL_FROM_NAME ?? 'Stockix',
  fromAddress: env.MAIL_FROM_ADDRESS ?? '',
} as const;

/** True when Resend SMTP can send (API key + verified from address). */
export function isMailConfigured(): boolean {
  return Boolean(mailConfig.password?.trim() && mailConfig.fromAddress?.trim());
}

export function getMailHealthStatus(): {
  configured: boolean;
  fromAddressSet: boolean;
} {
  return {
    configured: isMailConfigured(),
    fromAddressSet: Boolean(mailConfig.fromAddress?.trim()),
  };
}

export function getResendWebhookSecret(): string | undefined {
  return env.RESEND_WEBHOOK_SECRET?.trim() || undefined;
}

export const apiConfig = {
  get runBullMqConsumers() {
    const raw = env.RUN_BULLMQ_CONSUMERS;
    if (raw === undefined || raw === "") return true;
    return raw === "1" || raw.toLowerCase() === "true";
  },
  get databaseUrl() {
    return env.DATABASE_URL ?? readRequiredString("DATABASE_URL");
  },
  get platformApiSecret() {
    return env.PLATFORM_API_SECRET ?? readRequiredString("PLATFORM_API_SECRET");
  },
  get workerSecret() {
    return env.WORKER_SECRET;
  },
  /** Secret for finance internal routes; dev/test fall back to WORKER_SECRET when unset. */
  get internalApiSecret(): string | undefined {
    if (env.INTERNAL_API_SECRET) return env.INTERNAL_API_SECRET;
    if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
      return env.WORKER_SECRET;
    }
    return undefined;
  },
  get dashboardUrl() {
    return env.DASHBOARD_URL ?? readRequiredString("DASHBOARD_URL");
  },
  get rootDomain() {
    return env.ROOT_DOMAIN;
  },
  get corsOrigins() {
    return parseOrigins(env.CORS_ORIGINS);
  },
  get port() {
    return env.PORT;
  },
  get publicBaseUrlScheme() {
    return env.PUBLIC_BASE_URL_SCHEME;
  },
  get maxTenantPort() {
    return env.MAX_TENANT_PORT;
  },
  get tenantInternalHost() {
    return env.TENANT_INTERNAL_HOST;
  },
  get tenantEnvRoot() {
    return env.TENANT_ENV_ROOT;
  },
  get repoRoot() {
    return env.REPO_ROOT;
  },
  get stockixTenantAppRoot() {
    return env.STOCKIX_TENANT_APP_ROOT;
  },
  get traefikDynamicDir() {
    return env.TRAEFIK_DYNAMIC_DIR;
  },
  get traefikTenantUpstreamHost() {
    return env.TRAEFIK_TENANT_UPSTREAM_HOST;
  },
  get bootstrapAdminEmail() {
    return env.BOOTSTRAP_ADMIN_EMAIL;
  },
  get bootstrapAdminPassword() {
    return env.BOOTSTRAP_ADMIN_PASSWORD;
  },
  get nodeEnv() {
    return env.NODE_ENV;
  },
  get sessionSecret() {
    return env.SESSION_SECRET ?? readRequiredString("SESSION_SECRET");
  },
  /**
   * Secret used to sign/verify offline license JWTs (POS). Production/staging must set
   * LICENSE_SIGNING_SECRET (≥32 chars). Development/test fall back to a fixed local value.
   */
  get licenseSigningSecret() {
    const raw = env.LICENSE_SIGNING_SECRET?.trim();
    if (raw && raw.length >= 32) return raw;
    if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
      return "local-dev-license-signing-secret-min-32!";
    }
    throw new Error(
      "[config] LICENSE_SIGNING_SECRET is required (min 32 characters) outside development/test",
    );
  },
  get authTokenSecret() {
    return env.AUTH_TOKEN_SECRET ?? env.SESSION_SECRET ?? readRequiredString("AUTH_TOKEN_SECRET");
  },
  get allowBootstrapLogin() {
    return env.ALLOW_BOOTSTRAP_LOGIN === "true" || env.ALLOW_BOOTSTRAP_LOGIN === "1";
  },
  get signupDisabled(): boolean {
    // Default true — tenants are operator-provisioned. Override: SIGNUP_DISABLED=false
    const val = env.SIGNUP_DISABLED;
    if (val === undefined || val === null) return true;
    return val === "true" || val === "1";
  },
  get signupAllowedDomains(): string {
    return env.SIGNUP_ALLOWED_DOMAINS ?? "";
  },
  /** Platform-wide email allowlist appended to each tenant admin email at provision time. */
  get signupAllowedEmailsOverride(): string {
    return env.SIGNUP_ALLOWED_EMAILS ?? "";
  },
  get hostname() {
    return env.HOSTNAME;
  },
  get workerJobId() {
    return env.WORKER_JOB_ID;
  },
  get workerJobExecutionTimeoutMs() {
    return env.WORKER_JOB_EXECUTION_TIMEOUT_MS;
  },
  get dockerComposeUpTimeoutMs() {
    return env.DOCKER_COMPOSE_UP_TIMEOUT_MS;
  },
  get dockerComposeRunTimeoutMs() {
    return env.DOCKER_COMPOSE_RUN_TIMEOUT_MS;
  },
  get dockerComposeDefaultTimeoutMs() {
    return env.DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS;
  },
  get metricsEndpoint() {
    return env.METRICS_ENDPOINT;
  },
  get metricsAuthToken() {
    return env.METRICS_AUTH_TOKEN;
  },
  get deploymentSecretKey() {
    const raw = env.DEPLOYMENT_SECRET_KEY ?? readRequiredString("DEPLOYMENT_SECRET_KEY");
    if (raw.length < 32) {
      throw new Error("[config] DEPLOYMENT_SECRET_KEY must be at least 32 characters");
    }
    return createHash("sha256").update(raw).digest("hex");
  },
  get tenantDbNamePrefix() {
    return env.TENANT_DB_NAME_PREFIX ?? env.TENANT_DB_NAME_PERFIX;
  },
  /** Control-plane API URL used in worker/org-provision payloads. */
  get stockixApiUrl() {
    return env.STOCKIX_API_URL;
  },
  /** NEXT_PUBLIC variant of the API URL (used by dashboard and org-provision). */
  get nextPublicStockixApiUrl() {
    return env.NEXT_PUBLIC_STOCKIX_API_URL;
  },
  /** When true, finance license sync failures are non-fatal (dev only). */
  get financeLicenseSyncOptional(): boolean {
    const flag = env.FINANCE_LICENSE_SYNC_OPTIONAL?.trim().toLowerCase();
    if (flag === "1" || flag === "true") {
      return env.NODE_ENV === "development";
    }
    return false;
  },
  /** Brand display name (default: "Stockix"). */
  get brandName() {
    return env.BRAND_NAME;
  },
  /** Public URL for POS frontend (used in proxy error messages). */
  get posFrontendUrl() {
    return env.POS_FRONTEND_URL;
  },
  /** DSN for Sentry error reporting (optional). */
  get sentryDsn() {
    return env.SENTRY_DSN;
  },
  get controlPlaneRedisUrl() {
    const raw = env.CONTROL_PLANE_REDIS_URL?.trim();
    return raw && raw.length > 0 ? raw : undefined;
  },
  get workerHeartbeatStaleMs() {
    return env.WORKER_HEARTBEAT_STALE_MS;
  },
  get workerStaleLeaseThresholdMs() {
    return env.WORKER_STALE_LEASE_THRESHOLD_MS;
  },
  validateRequiredEnv() {
    validateRequiredEnvForProfile(env.NODE_ENV);
  },
} as const;

export const dashboardConfig = {
  get databaseUrl() {
    return env.DATABASE_URL ?? readRequiredString("DATABASE_URL");
  },
  get sessionSecret() {
    return env.SESSION_SECRET ?? readRequiredString("SESSION_SECRET");
  },
  get platformApiSecret() {
    return env.PLATFORM_API_SECRET ?? readRequiredString("PLATFORM_API_SECRET");
  },
  get platformAdminEmail() {
    return env.PLATFORM_ADMIN_EMAIL ?? readRequiredString("PLATFORM_ADMIN_EMAIL");
  },
  get platformAdminPassword() {
    return env.PLATFORM_ADMIN_PASSWORD ?? readRequiredString("PLATFORM_ADMIN_PASSWORD");
  },
  get nodeEnv() {
    return env.NODE_ENV;
  },
  get nextPublicApiUrl() {
    return env.NEXT_PUBLIC_STOCKIX_API_URL;
  },
  get nextPublicScheme() {
    return env.NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME;
  },
  get nextPublicRootDomain() {
    return env.NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN;
  },
  get nextPublicLocalTenantHost() {
    return env.NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST;
  },
  get securityHsts() {
    return env.SECURITY_HSTS;
  },
  get securityXFrameOptions() {
    return env.SECURITY_X_FRAME_OPTIONS;
  },
  get securityReferrerPolicy() {
    return env.SECURITY_REFERRER_POLICY;
  },
  get securityXContentTypeOptions() {
    return env.SECURITY_X_CONTENT_TYPE_OPTIONS;
  },
  get securityCspBase() {
    return env.SECURITY_CSP_BASE;
  },
} as const;

export const dbConfig = {
  get databaseUrl() {
    return env.DATABASE_URL ?? readRequiredString("DATABASE_URL");
  },
  get waitTimeoutMs() {
    return env.DB_WAIT_TIMEOUT_MS;
  },
} as const;

export const infraConfig = {
  /** Redis URL for control-plane queues (BullMQ). Optional — queues disabled when unset. */
  get controlPlaneRedisUrl() {
    return env.CONTROL_PLANE_REDIS_URL;
  },
  /** How often the stuck-provisioning reconciler runs in ms (default: 60 000). */
  get provisionReconcileIntervalMs() {
    return env.PROVISION_RECONCILE_INTERVAL_MS;
  },
  get rootDomain() {
    return env.ROOT_DOMAIN;
  },
  get nextPublicStockixApiUrl() {
    return env.NEXT_PUBLIC_STOCKIX_API_URL;
  },
  get postgresUser() {
    return env.POSTGRES_USER;
  },
  get postgresPassword() {
    return env.POSTGRES_PASSWORD;
  },
  get postgresDb() {
    return env.POSTGRES_DB;
  },
  get postgresHostPort() {
    return env.POSTGRES_HOST_PORT;
  },
  get acmeEmail() {
    return env.ACME_EMAIL;
  },
  get cloudflareDnsToken() {
    return env.CF_DNS_API_TOKEN;
  },
  get stockixRepo() {
    return env.STOCKIX_REPO;
  },
} as const;

// =============================================================================
// PRODUCT CONFIGS (POS, PMS, Chatwoot, Module Gating)
// =============================================================================

export const posConfig = {
  /** Base URL for POS platform API — used by apps/api proxy routes */
  platformBaseUrl: process.env.POS_PLATFORM_BASE_URL ?? "http://localhost:8010",
  /** Service API key for Stockix → POS server-to-server calls */
  platformApiKey: process.env.POS_PLATFORM_API_KEY ?? "",
  /** Absolute path to POS app root for worker provisioning */
  appRoot: process.env.POS_APP_ROOT ?? "services/posnew",
  /** Public URL of the POS frontend (used in error messages / provisioning payloads) */
  get frontendUrl() {
    return env.POS_FRONTEND_URL ?? "";
  },
} as const;

export const pmsConfig = {
  /** Port the PMS Hono service listens on */
  port: parseInt(process.env.PMS_PORT ?? "3003", 10),
  /** Base URL for PMS API — used by apps/api proxy routes */
  baseUrl: process.env.PMS_BASE_URL ?? "http://localhost:3003",
  /** Absolute path to PMS app root for worker provisioning */
  appRoot: process.env.PMS_APP_ROOT ?? "services/pms",
  /** How often iCal feeds are synced in milliseconds */
  icalSyncIntervalMs: parseInt(process.env.PMS_ICAL_SYNC_INTERVAL_MS ?? "600000", 10),
  /** Google Gemini API key for passport OCR (optional) */
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  /** Internal base URL for Finance API (used by PMS finance-sync). */
  financeInternalBaseUrl: process.env.FINANCE_INTERNAL_BASE_URL ?? "http://localhost:3000",
} as const;

export const chatwootConfig = {
  /** Public URL of the shared Chatwoot instance */
  baseUrl: process.env.CHATWOOT_BASE_URL ?? "",
  /** Super admin API token for account provisioning */
  apiAccessToken: process.env.CHATWOOT_API_ACCESS_TOKEN ?? "",
  /** Rails SECRET_KEY_BASE */
  secretKeyBase: process.env.CHATWOOT_SECRET_KEY_BASE ?? "",
  /** Brand name shown in Chatwoot UI */
  brandName: process.env.CHATWOOT_BRAND_NAME ?? "Stockix",
  /** Installation name for Chatwoot telemetry */
  installationName: process.env.CHATWOOT_INSTALLATION_NAME ?? "Stockix",
} as const;

export const moduleGatingConfig = {
  /**
   * When true (default), worker provisions only the Docker stacks matching
   * the tenant's modules[] array.
   * Set PROVISION_MODULE_GATING=0 for legacy mode (always provisions Finance).
   */
  get enabled() {
    return process.env.PROVISION_MODULE_GATING !== "0";
  },
} as const;

export const licenseConfig = {
  defaultTermDays: parseInt(process.env.DEFAULT_LICENSE_TERM_DAYS ?? "365", 10),
  /** When true, license sync failures return HTTP 502 instead of soft-failing. */
  get syncStrict() {
    return env.LICENSE_SYNC_STRICT === "1";
  },
} as const;

