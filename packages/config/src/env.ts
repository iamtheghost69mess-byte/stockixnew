import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { z } from "zod";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(configDir, "..", "..", "..");

// Standard pattern: `.env` (shared defaults) then `.env.local` (machine-specific overrides).
// Skip automatic loading under Vitest so unit tests control `process.env`.
// Set STOCKIX_LOAD_ROOT_ENV=1 to force-load anyway.
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

function parseValue<T>(schema: z.ZodType<T>, value: unknown, name: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`[config] invalid ${name}: ${result.error.issues.map((i) => i.message).join(", ")}`);
  }
  return result.data;
}

export function readOptionalString(name: string): string | undefined {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  return parseValue(optionalStringSchema, normalized.length > 0 ? normalized : undefined, name);
}

export function readString(name: string, fallback: string): string {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  const resolved = normalized.length > 0 ? normalized : fallback;
  return parseValue(stringSchema, resolved, name);
}

export function readRequiredString(name: string): string {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  return parseValue(stringSchema, normalized, name);
}

export function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const resolved = raw === undefined || raw === null || raw === "" ? fallback : raw;
  return parseValue(numberSchema, resolved, name);
}

export function readBooleanLike(name: string): "true" | "false" | "1" | "0" | undefined {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return parseValue(booleanStringSchema, normalized.length > 0 ? normalized : undefined, name);
}

export function parseOrigins(raw: string | undefined): string[] {
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

const recommendedByProfile: Record<string, string[]> = {
  production: ["RESEND_WEBHOOK_SECRET", "SENTRY_DSN"],
  staging: ["RESEND_WEBHOOK_SECRET", "SENTRY_DSN"],
};

function validateRecommendedEnvForProfile(profile: string): string[] {
  const recommended = recommendedByProfile[profile] ?? [];
  return recommended.filter((name) => {
    const value = process.env[name];
    return !value || value.trim().length === 0;
  });
}

const DEV_WORKER_SECRET = "dev-worker-secret";
const MIN_WORKER_SECRET_LENGTH = 32;

export function validateWorkerSecret(profile: string, workerSecret: string | undefined): void {
  if (profile !== "production" && profile !== "staging") return;
  const secret = workerSecret?.trim() ?? "";
  if (!secret || secret === DEV_WORKER_SECRET) {
    throw new Error("[config] WORKER_SECRET must be set in staging/production");
  }
  if (secret.length < MIN_WORKER_SECRET_LENGTH) {
    throw new Error(
      `[config] WORKER_SECRET must be at least ${MIN_WORKER_SECRET_LENGTH} characters in staging/production`,
    );
  }
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
  API_HOST: readOptionalString("API_HOST"),
  PLATFORM_API_SECRET: readOptionalString("PLATFORM_API_SECRET"),
  DASHBOARD_URL: readOptionalString("DASHBOARD_URL"),
  BOOTSTRAP_ADMIN_EMAIL: readOptionalString("BOOTSTRAP_ADMIN_EMAIL"),
  BOOTSTRAP_ADMIN_PASSWORD: readOptionalString("BOOTSTRAP_ADMIN_PASSWORD"),
  ROOT_DOMAIN: readOptionalString("ROOT_DOMAIN"),
  PUBLIC_BASE_URL_SCHEME: readString("PUBLIC_BASE_URL_SCHEME", "http").toLowerCase(),
  MAX_TENANT_PORT: readNumber("MAX_TENANT_PORT", 49999),
  STOCKIX_TENANT_APP_ROOT: readOptionalString("STOCKIX_TENANT_APP_ROOT"),
  REPO_ROOT: readOptionalString("REPO_ROOT"),
  TENANT_ENV_ROOT: readOptionalString("TENANT_ENV_ROOT"),
  TRAEFIK_DYNAMIC_DIR: readString("TRAEFIK_DYNAMIC_DIR", "/opt/stockix/traefik-dynamic"),
  TRAEFIK_TENANT_UPSTREAM_HOST: readString("TRAEFIK_TENANT_UPSTREAM_HOST", "host.docker.internal"),
  TENANT_INTERNAL_HOST: readString("TENANT_INTERNAL_HOST", "127.0.0.1"),
  CORS_ORIGINS: readOptionalString("CORS_ORIGINS"),
  SESSION_SECRET: readOptionalString("SESSION_SECRET"),
  LICENSE_SIGNING_SECRET: readOptionalString("LICENSE_SIGNING_SECRET"),
  AUTH_TOKEN_SECRET: readOptionalString("AUTH_TOKEN_SECRET"),
  PLATFORM_JWT_SECRET: readOptionalString("PLATFORM_JWT_SECRET"),
  ALLOW_BOOTSTRAP_LOGIN: readBooleanLike("ALLOW_BOOTSTRAP_LOGIN"),
  PLATFORM_ADMIN_EMAIL: readOptionalString("PLATFORM_ADMIN_EMAIL"),
  PLATFORM_ADMIN_PASSWORD: readOptionalString("PLATFORM_ADMIN_PASSWORD"),
  NEXT_PUBLIC_STOCKIX_API_URL: readString("NEXT_PUBLIC_STOCKIX_API_URL", "http://localhost:4000"),
  NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME: readString("NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME", "http"),
  NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN: readString("NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN", "localhost"),
  NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST: readString("NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST", "127.0.0.1"),
  NEXT_PUBLIC_SENTRY_DSN: readOptionalString("NEXT_PUBLIC_SENTRY_DSN"),
  SECURITY_HSTS: readString("SECURITY_HSTS", "max-age=31536000; includeSubDomains"),
  SECURITY_X_FRAME_OPTIONS: readString("SECURITY_X_FRAME_OPTIONS", "DENY"),
  SECURITY_REFERRER_POLICY: readString("SECURITY_REFERRER_POLICY", "strict-origin-when-cross-origin"),
  SECURITY_X_CONTENT_TYPE_OPTIONS: readString("SECURITY_X_CONTENT_TYPE_OPTIONS", "nosniff"),
  SECURITY_CSP_BASE: readString(
    "SECURITY_CSP_BASE",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  ),
  STOCKIX_API_URL: readString("STOCKIX_API_URL", "http://localhost:4000"),
  STOCKIX_SERVER_API_URL: readOptionalString("STOCKIX_SERVER_API_URL"),
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
  WORKER_CONCURRENCY: readNumber("WORKER_CONCURRENCY", 1),
  MYSQL_PROXY_HOST: readString("MYSQL_PROXY_HOST", "stockix-mysql-proxy"),
  MYSQL_PROXY_PORT: readNumber("MYSQL_PROXY_PORT", 6033),
  TENANT_REDIS_PASSWORD: readOptionalString("TENANT_REDIS_PASSWORD"),
  PROXYSQL_ADMIN_USER: readString("PROXYSQL_ADMIN_USER", "admin"),
  PROXYSQL_ADMIN_PASSWORD: readString("PROXYSQL_ADMIN_PASSWORD", "admin"),
  WORKER_INTERNAL_NETWORK: readString("WORKER_INTERNAL_NETWORK", "stockix_internal"),
  RUN_BULLMQ_CONSUMERS: readOptionalString("RUN_BULLMQ_CONSUMERS"),
  INTERNAL_API_SECRET: readOptionalString("INTERNAL_API_SECRET"),
  WORKER_JOB_EXECUTION_TIMEOUT_MS: readNumber("WORKER_JOB_EXECUTION_TIMEOUT_MS", 45 * 60 * 1000),
  WORKER_HEARTBEAT_STALE_MS: readNumber("WORKER_HEARTBEAT_STALE_MS", 600_000),
  WORKER_STALE_LEASE_THRESHOLD_MS: readNumber("WORKER_STALE_LEASE_THRESHOLD_MS", 3_000_000),
  DOCKER_COMPOSE_UP_TIMEOUT_MS: readNumber("DOCKER_COMPOSE_UP_TIMEOUT_MS", 30 * 60 * 1000),
  DOCKER_COMPOSE_RUN_TIMEOUT_MS: readNumber("DOCKER_COMPOSE_RUN_TIMEOUT_MS", 15 * 60 * 1000),
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
  MAIL_TRANSPORT: readOptionalString("MAIL_TRANSPORT"),
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
  npm_packageon: readOptionalString("npm_packageon"),
  npm_package_type: readOptionalString("npm_package_type"),
} as const;

export { validateRequiredEnvForProfile, validateRecommendedEnvForProfile };
