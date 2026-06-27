import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { z } from "zod";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(configDir, "..", "..", "..");

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

const booleanLike = z.enum(["true", "false", "1", "0", ""]).transform((v) => v === "true" || v === "1");

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

// ---------------------------------------------------------
// Strict Base Schema
// ---------------------------------------------------------
const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  
  // App
  BRAND_NAME: z.string().default("Stockix"),
  PORT: z.coerce.number(),
  API_HOST: z.string().optional(),
  HOSTNAME: z.string().default("server"),
  PUBLIC_URL: z.string().optional(),
  BASE_URL: z.string().optional(),
  ROOT_DOMAIN: z.string().optional(),
  PUBLIC_BASE_URL_SCHEME: z.string().default("http"),
  
  // Security & Secrets
  SESSION_SECRET: z.string().min(16),
  AUTH_TOKEN_SECRET: z.string().min(16),
  PLATFORM_API_SECRET: z.string().min(16),
  WORKER_SECRET: z.string().min(32),
  DEPLOYMENT_SECRET_KEY: z.string().min(16),
  LICENSE_SIGNING_SECRET: z.string().min(16),
  PLATFORM_JWT_SECRET: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  INTERNAL_API_SECRET: z.string().optional(),
  FIELD_ENCRYPTION_KEY: z.string().optional(),
  
  // Databases (Postgres)
  DATABASE_URL: z.string().url(),
  DB_WAIT_TIMEOUT_MS: z.coerce.number().default(90_000),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_IDLE_TIMEOUT_SECONDS: z.coerce.number().default(30),
  DB_CONNECT_TIMEOUT_SECONDS: z.coerce.number().default(10),
  DB_MAX_LIFETIME_SECONDS: z.coerce.number().default(1800),
  POSTGRES_USER: z.string().optional(),
  POSTGRES_PASSWORD: z.string().optional(),
  POSTGRES_DB: z.string().optional(),
  POSTGRES_HOST_PORT: z.string().optional(),

  // Redis
  CONTROL_PLANE_REDIS_URL: z.string().url().optional(),
  TENANT_REDIS_HOST: z.string().min(1),
  TENANT_REDIS_PASSWORD: z.string().optional(),
  
  // Mongo
  SHARED_MONGO_HOST: z.string().min(1),
  MONGODB_DATABASE_URL: z.string().optional(),
  
  // Shared MySQL
  SHARED_MYSQL_HOST: z.string().min(1),
  MYSQL_PROXY_HOST: z.string().min(1),
  MYSQL_PROXY_PORT: z.coerce.number().min(1),
  WORKER_MYSQL_PROXY_PORT: z.coerce.number().min(1),
  PROXYSQL_ADMIN_USER: z.string().min(1),
  PROXYSQL_ADMIN_PASSWORD: z.string().min(1),

  // Mail
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.string().optional(),
  MAIL_SECURE: booleanLike.optional(),
  MAIL_USERNAME: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM_NAME: z.string().optional(),
  MAIL_FROM_ADDRESS: z.string().optional(),
  MAIL_TRANSPORT: z.string().optional(),
  
  // Resend
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  
  // Security Headers
  SECURITY_HSTS: z.string().default("max-age=31536000; includeSubDomains"),
  SECURITY_X_FRAME_OPTIONS: z.string().default("DENY"),
  SECURITY_REFERRER_POLICY: z.string().default("strict-origin-when-cross-origin"),
  SECURITY_X_CONTENT_TYPE_OPTIONS: z.string().default("nosniff"),
  SECURITY_CSP_BASE: z.string().default("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"),
  CORS_ORIGINS: z.string().optional(),
  
  // Worker & Provisioning
  WORKER_CONCURRENCY: z.coerce.number().min(1),
  WORKER_HEALTH_PORT: z.coerce.number().min(1),
  WORKER_STARTUP_GRACE_MS: z.coerce.number().default(5000),
  WORKER_JOB_EXECUTION_TIMEOUT_MS: z.coerce.number().default(45 * 60 * 1000),
  WORKER_HEARTBEAT_STALE_MS: z.coerce.number().default(600_000),
  WORKER_STALE_LEASE_THRESHOLD_MS: z.coerce.number().default(3_000_000),
  WORKER_JOB_ID: z.string().optional(),
  WORKER_INTERNAL_NETWORK: z.string().min(1),
  RUN_BULLMQ_CONSUMERS: z.string().optional(),
  
  PROVISION_POLL_MS: z.coerce.number().default(2000),
  PROVISION_MAX_MS: z.coerce.number().default(45 * 60 * 1000),
  PROVISION_RECONCILE_INTERVAL_MS: z.coerce.number().default(60_000),
  PROVISION_ADMIN_EMAIL: z.string().optional(),
  
  // NextJS / Dashboard
  DASHBOARD_URL: z.string().url().optional(),
  NEXT_PUBLIC_STOCKIX_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME: z.string().optional(),
  NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  
  STOCKIX_API_URL: z.string().url().optional(),
  STOCKIX_SERVER_API_URL: z.string().url().optional(),
  
  // Tenants
  TENANT_ENV_ROOT: z.string().min(1),
  MAX_TENANT_PORT: z.coerce.number().default(49999),
  TENANT_PORT_RANGE_MAX: z.coerce.number().default(65000),
  TENANT_PORT_RANGE_MIN: z.coerce.number().default(10000),
  TENANT_INTERNAL_HOST: z.string().min(1),
  STOCKIX_TENANT_APP_ROOT: z.string().optional(),
  
  // Docker
  DOCKER_HOST: z.string().optional(),
  DOCKER_COMPOSE_UP_TIMEOUT_MS: z.coerce.number().default(30 * 60 * 1000),
  DOCKER_COMPOSE_RUN_TIMEOUT_MS: z.coerce.number().default(15 * 60 * 1000),
  DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS: z.coerce.number().default(10 * 60 * 1000),
  
  // Traefik
  TRAEFIK_DYNAMIC_DIR: z.string().min(1),
  TRAEFIK_TENANT_UPSTREAM_HOST: z.string().min(1),
  TRAEFIK_NETWORK: z.string().default("stockix_public"),
  TRAEFIK_LABELS_ENABLED: booleanLike.default("false"),
  
  // Sentry
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  RELEASE_VERSION: z.string().optional(),
  
  // Others
  FINANCE_LICENSE_SYNC_OPTIONAL: z.string().optional(),
  LICENSE_SYNC_STRICT: z.string().optional(),
  POS_FRONTEND_URL: z.string().optional(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  REPO_ROOT: z.string().optional(),
  ALLOW_BOOTSTRAP_LOGIN: booleanLike.optional(),
  PLATFORM_ADMIN_EMAIL: z.string().optional(),
  PLATFORM_ADMIN_PASSWORD: z.string().optional(),
  OWNER_ID: z.string().optional(),
  ACME_EMAIL: z.string().optional(),
  CF_DNS_API_TOKEN: z.string().optional(),
  STOCKIX_REPO: z.string().optional(),
  PLAYWRIGHT_TEST_BASE_URL: z.string().optional(),
  SMOKE_OWNER_ID: z.string().optional(),
  SIGNUP_DISABLED: booleanLike.optional(),
  SIGNUP_ALLOWED_DOMAINS: z.string().optional(),
  SIGNUP_ALLOWED_EMAILS: z.string().optional(),
  BROWSER_WS_ENDPOINT: z.string().optional(),
  METRICS_ENDPOINT: z.string().optional(),
  METRICS_AUTH_TOKEN: z.string().optional(),
  MONOREPO_VERSION: z.string().optional(),
  CHATWOOT_BASE_URL: z.string().optional(),
  CHATWOOT_API_ACCESS_TOKEN: z.string().optional(),
  PROXYSQL_STATS_URL: z.string().optional(),
  POS_HOST_PORT: z.coerce.number().optional(),
  POS_FRONTEND_HOST_PORT: z.coerce.number().optional(),
  POS_APP_ROOT: z.string().optional(),
  PMS_APP_ROOT: z.string().optional(),
  POS_FINANCE_INTERNAL_URL_TEMPLATE: z.string().optional(),
  POS_FINANCE_USE_TRAEFIK_URL: z.string().optional(),
  POS_FINANCE_INTERNAL_HOST: z.string().optional(),
  
  // Agenda
  AGENDA_DB_COLLECTION: z.string().optional(),
  AGENDA_POOL_TIME: z.string().optional(),
  AGENDA_CONCURRENCY: z.string().optional(),
  AGENDASH_AUTH_USER: z.string().optional(),
  AGENDASH_AUTH_PASSWORD: z.string().optional(),
  EASY_SMS_TOKEN: z.string().optional(),
  
  // DB Tenants/System Overrides
  DB_CLIENT: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_CHARSET: z.string().optional(),
  SYSTEM_DB_CLIENT: z.string().optional(),
  SYSTEM_DB_HOST: z.string().optional(),
  SYSTEM_DB_USER: z.string().optional(),
  SYSTEM_DB_PASSWORD: z.string().optional(),
  SYSTEM_DB_NAME: z.string().optional(),
  SYSTEM_DB_CHARSET: z.string().optional(),
  TENANT_DB_CLIENT: z.string().optional(),
  TENANT_DB_NAME_PREFIX: z.string().optional(),
  TENANT_DB_NAME_PERFIX: z.string().optional(),
  TENANT_DB_HOST: z.string().optional(),
  TENANT_DB_USER: z.string().optional(),
  TENANT_DB_PASSWORD: z.string().optional(),
  TENANT_DB_CHARSET: z.string().optional(),
  
  npm_packageon: z.string().optional(),
  npm_package_type: z.string().optional(),
  
  THROTTLE_GLOBAL_TTL: z.coerce.number().default(60_000),
  THROTTLE_GLOBAL_LIMIT: z.coerce.number().default(2000),
  THROTTLE_AUTH_TTL: z.coerce.number().default(60_000),
  THROTTLE_AUTH_LIMIT: z.coerce.number().default(200),
});

// For backward compatibility for these utility exports that were removed but might be imported
export function readRequiredString(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[config] Missing required environment variable: ${key}`);
  }
  return value;
}
export function validateRequiredEnvForProfile(_profile: string) { return; }
export function validateRecommendedEnvForProfile(_profile: string) { return []; }
export function validateWorkerSecret(_profile: string, _workerSecret: string | undefined) { return; }

// Validate and export!
const parsed = baseSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  // Fail fast.
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging" || process.env.STOCKIX_STRICT_CONFIG === "1") {
    throw new Error(`[config] Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
}

// In case of error in dev, we cast so the app can start but throw loudly.
export const env = parsed.success ? parsed.data : (process.env as unknown as z.infer<typeof baseSchema>);
export type Env = z.infer<typeof baseSchema>;
