var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../infra/worker-service/src/worker.ts
import { randomUUID } from "crypto";
import { statSync } from "fs";
import { dirname as dirname2, join as join9 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
import { execa as execa5 } from "execa";

// ../../packages/config/src/index.ts
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { createHash } from "crypto";
import { existsSync } from "fs";
import { z } from "zod";
var configDir = path.dirname(fileURLToPath(import.meta.url));
var monorepoRoot = path.join(configDir, "..", "..", "..");
var rootEnv = path.join(monorepoRoot, ".env");
var rootEnvLocal = path.join(monorepoRoot, ".env.local");
var loadRootEnvFlag = process.env.STOCKIX_LOAD_ROOT_ENV?.trim().toLowerCase();
var shouldLoadRootDotenv = loadRootEnvFlag === "0" || loadRootEnvFlag === "false" ? false : loadRootEnvFlag === "1" || process.env.VITEST !== "true";
if (shouldLoadRootDotenv) {
  if (existsSync(rootEnv)) {
    loadEnv({ path: rootEnv, override: false });
  }
  if (existsSync(rootEnvLocal)) {
    loadEnv({ path: rootEnvLocal, override: true });
  }
}
var optionalStringSchema = z.string().min(1).optional();
var stringSchema = z.string().min(1);
var numberSchema = z.coerce.number().finite();
var booleanStringSchema = z.enum(["true", "false", "1", "0"]).optional();
function parseValue(schema, value, name) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`[config] invalid ${name}: ${result.error.issues.map((i) => i.message).join(", ")}`);
  }
  return result.data;
}
function readOptionalString(name) {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  return parseValue(optionalStringSchema, normalized.length > 0 ? normalized : void 0, name);
}
function readString(name, fallback) {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  const resolved = normalized.length > 0 ? normalized : fallback;
  return parseValue(stringSchema, resolved, name);
}
function readRequiredString(name) {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  return parseValue(stringSchema, normalized, name);
}
function readNumber(name, fallback) {
  const raw = process.env[name];
  const resolved = raw === void 0 || raw === null || raw === "" ? fallback : raw;
  return parseValue(numberSchema, resolved, name);
}
function readBooleanLike(name) {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return parseValue(booleanStringSchema, normalized.length > 0 ? normalized : void 0, name);
}
function parseOrigins(raw) {
  if (!raw) return [];
  return raw.split(",").map((origin) => origin.trim()).filter(Boolean).map((origin) => {
    try {
      return new URL(origin).origin;
    } catch {
      throw new Error(`[config] invalid CORS origin: ${origin}`);
    }
  });
}
function validateRequiredEnvForProfile(profile) {
  const requiredByProfile = {
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
      "LICENSE_SIGNING_SECRET"
    ],
    production: [
      "DATABASE_URL",
      "PLATFORM_API_SECRET",
      "WORKER_SECRET",
      "SESSION_SECRET",
      "DASHBOARD_URL",
      "AUTH_TOKEN_SECRET",
      "DEPLOYMENT_SECRET_KEY",
      "LICENSE_SIGNING_SECRET"
    ]
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
var env = {
  DATABASE_URL: readOptionalString("DATABASE_URL"),
  DB_WAIT_TIMEOUT_MS: readNumber("DB_WAIT_TIMEOUT_MS", 9e4),
  PORT: readNumber("PORT", 4e3),
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
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  ),
  STOCKIX_API_URL: readString("STOCKIX_API_URL", "http://localhost:4000"),
  PROVISION_POLL_MS: readNumber("PROVISION_POLL_MS", 2e3),
  PROVISION_MAX_MS: readNumber("PROVISION_MAX_MS", 45 * 60 * 1e3),
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
  /** Shared with stockix-finance for POST /api/internal/* (provisioning attach-user). */
  INTERNAL_API_SECRET: readOptionalString("INTERNAL_API_SECRET"),
  /** Max time (ms) the worker allows a single job to run before aborting (must be >= slow docker image builds). */
  WORKER_JOB_EXECUTION_TIMEOUT_MS: readNumber("WORKER_JOB_EXECUTION_TIMEOUT_MS", 45 * 60 * 1e3),
  /** Max time (ms) for docker compose up/build/pull (first image pull can exceed 5m). */
  DOCKER_COMPOSE_UP_TIMEOUT_MS: readNumber("DOCKER_COMPOSE_UP_TIMEOUT_MS", 30 * 60 * 1e3),
  /** Max time (ms) for docker compose run (migrations). */
  DOCKER_COMPOSE_RUN_TIMEOUT_MS: readNumber("DOCKER_COMPOSE_RUN_TIMEOUT_MS", 15 * 60 * 1e3),
  /** Max time (ms) for other compose subcommands (down uses a fixed 2m in code). */
  DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS: readNumber("DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS", 10 * 60 * 1e3),
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
  THROTTLE_GLOBAL_TTL: readNumber("THROTTLE_GLOBAL_TTL", 6e4),
  THROTTLE_GLOBAL_LIMIT: readNumber("THROTTLE_GLOBAL_LIMIT", 2e3),
  THROTTLE_AUTH_TTL: readNumber("THROTTLE_AUTH_TTL", 6e4),
  THROTTLE_AUTH_LIMIT: readNumber("THROTTLE_AUTH_LIMIT", 200),
  npm_package_json: readOptionalString("npm_package_json"),
  npm_package_type: readOptionalString("npm_package_type")
};
var mailConfig = {
  host: env.MAIL_HOST ?? "",
  port: parseInt(env.MAIL_PORT ?? "587", 10),
  username: env.MAIL_USERNAME ?? "",
  password: env.MAIL_PASSWORD ?? "",
  secure: env.MAIL_SECURE === "true" || env.MAIL_SECURE === "1",
  fromName: env.MAIL_FROM_NAME ?? "Stockix",
  fromAddress: env.MAIL_FROM_ADDRESS ?? ""
};
function isMailConfigured() {
  return Boolean(mailConfig.password?.trim() && mailConfig.fromAddress?.trim());
}
var apiConfig = {
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
  get internalApiSecret() {
    if (env.INTERNAL_API_SECRET) return env.INTERNAL_API_SECRET;
    if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
      return env.WORKER_SECRET;
    }
    return void 0;
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
      "[config] LICENSE_SIGNING_SECRET is required (min 32 characters) outside development/test"
    );
  },
  get authTokenSecret() {
    return env.AUTH_TOKEN_SECRET ?? env.SESSION_SECRET ?? readRequiredString("AUTH_TOKEN_SECRET");
  },
  get allowBootstrapLogin() {
    return env.ALLOW_BOOTSTRAP_LOGIN === "true" || env.ALLOW_BOOTSTRAP_LOGIN === "1";
  },
  get signupDisabled() {
    const val = env.SIGNUP_DISABLED;
    if (val === void 0 || val === null) return true;
    return val === "true" || val === "1";
  },
  get signupAllowedDomains() {
    return env.SIGNUP_ALLOWED_DOMAINS ?? "";
  },
  /** Platform-wide email allowlist appended to each tenant admin email at provision time. */
  get signupAllowedEmailsOverride() {
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
  validateRequiredEnv() {
    validateRequiredEnvForProfile(env.NODE_ENV);
  }
};
var posConfig = {
  /** Base URL for POS platform API — used by apps/api proxy routes */
  platformBaseUrl: process.env.POS_PLATFORM_BASE_URL ?? "http://localhost:8010",
  /** Service API key for Stockix → POS server-to-server calls */
  platformApiKey: process.env.POS_PLATFORM_API_KEY ?? "",
  /** Absolute path to POS app root for worker provisioning */
  appRoot: process.env.POS_APP_ROOT ?? "services/posnew"
};
var pmsConfig = {
  /** Port the PMS Hono service listens on */
  port: parseInt(process.env.PMS_PORT ?? "3003", 10),
  /** Base URL for PMS API — used by apps/api proxy routes */
  baseUrl: process.env.PMS_BASE_URL ?? "http://localhost:3003",
  /** Absolute path to PMS app root for worker provisioning */
  appRoot: process.env.PMS_APP_ROOT ?? "services/pms",
  /** How often iCal feeds are synced in milliseconds */
  icalSyncIntervalMs: parseInt(process.env.PMS_ICAL_SYNC_INTERVAL_MS ?? "600000", 10),
  /** Google Gemini API key for passport OCR (optional) */
  geminiApiKey: process.env.GEMINI_API_KEY ?? ""
};
var chatwootConfig = {
  /** Public URL of the shared Chatwoot instance */
  baseUrl: process.env.CHATWOOT_BASE_URL ?? "",
  /** Super admin API token for account provisioning */
  apiAccessToken: process.env.CHATWOOT_API_ACCESS_TOKEN ?? "",
  /** Rails SECRET_KEY_BASE */
  secretKeyBase: process.env.CHATWOOT_SECRET_KEY_BASE ?? "",
  /** Brand name shown in Chatwoot UI */
  brandName: process.env.CHATWOOT_BRAND_NAME ?? "Stockix",
  /** Installation name for Chatwoot telemetry */
  installationName: process.env.CHATWOOT_INSTALLATION_NAME ?? "Stockix"
};
var moduleGatingConfig = {
  /**
   * When true (default), worker provisions only the Docker stacks matching
   * the tenant's modules[] array.
   * Set PROVISION_MODULE_GATING=0 for legacy mode (always provisions Finance).
   */
  get enabled() {
    return process.env.PROVISION_MODULE_GATING !== "0";
  }
};

// ../../packages/db/src/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// ../../packages/db/src/schema.ts
var schema_exports = {};
__export(schema_exports, {
  adminAuditLog: () => adminAuditLog,
  apiIdempotencyKeys: () => apiIdempotencyKeys,
  apiKeys: () => apiKeys,
  blacklistedFingerprints: () => blacklistedFingerprints,
  emailLogs: () => emailLogs,
  licenseActivations: () => licenseActivations,
  licenseHistory: () => licenseHistory,
  licenses: () => licenses,
  organizations: () => organizations,
  ownerNotifications: () => ownerNotifications,
  ownerOrganizationAccess: () => ownerOrganizationAccess,
  owners: () => owners,
  plans: () => plans,
  platformRoles: () => platformRoles,
  pmsBookings: () => pmsBookings,
  pmsCalendarEvents: () => pmsCalendarEvents,
  pmsCleanerAssignments: () => pmsCleanerAssignments,
  pmsCleaners: () => pmsCleaners,
  pmsCleaningTasks: () => pmsCleaningTasks,
  pmsDateOverrides: () => pmsDateOverrides,
  pmsGuestFormSubmissions: () => pmsGuestFormSubmissions,
  pmsGuestFormTemplates: () => pmsGuestFormTemplates,
  pmsGuests: () => pmsGuests,
  pmsIcalChannels: () => pmsIcalChannels,
  pmsMessageTemplates: () => pmsMessageTemplates,
  pmsPayments: () => pmsPayments,
  pmsProperties: () => pmsProperties,
  pmsPropertyManagerInvites: () => pmsPropertyManagerInvites,
  pmsPropertyManagers: () => pmsPropertyManagers,
  pmsRooms: () => pmsRooms,
  pmsStaff: () => pmsStaff,
  pmsSyncLogs: () => pmsSyncLogs,
  tenantConfig: () => tenantConfig,
  tenantDeployments: () => tenantDeployments,
  tenantLifecycleJobs: () => tenantLifecycleJobs,
  tenantProvisionEvents: () => tenantProvisionEvents,
  tenants: () => tenants
});
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
var platformRoles = pgTable(
  "platform_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    permissions: jsonb("permissions").$type().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("platform_roles_slug_unique").on(t.slug)]
);
var owners = pgTable(
  "owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("super_admin"),
    roleId: uuid("role_id").references(() => platformRoles.id, {
      onDelete: "restrict"
    }),
    status: text("status").notNull().default("active"),
    sessionVersion: integer("session_version").notNull().default(1),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    mfaSecret: text("mfa_secret"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    inviteToken: text("invite_token"),
    inviteTokenExpiresAt: timestamp("invite_token_expires_at", {
      withTimezone: true
    }),
    invitedById: uuid("invited_by_id").references(() => owners.id),
    passwordResetTokenHash: text("password_reset_token_hash"),
    passwordResetExpiresAt: timestamp("password_reset_expires_at", {
      withTimezone: true
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("owners_email_unique").on(t.email)]
);
var tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "restrict" }),
    /** Stockix bootstrap admin (not the Stockix platform owner). */
    adminEmail: text("admin_email").notNull(),
    adminFirstName: text("admin_first_name").notNull(),
    adminLastName: text("admin_last_name").notNull(),
    status: text("status").notNull().default("active"),
    planSlug: text("plan_slug").notNull().default("starter"),
    /** JSON array of licensed product modules, e.g. ["accounting","pos"]. */
    modules: text("modules").notNull().default('["accounting"]'),
    /** Chatwoot account id when chat module is provisioned. */
    chatwootAccountId: text("chatwoot_account_id"),
    /** Human-readable org identifier (ORG-00001). */
    organizationNumber: varchar("organization_number", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("tenants_slug_unique").on(t.slug),
    uniqueIndex("tenants_organization_number_unique").on(t.organizationNumber)
  ]
);
var organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  subdomain: varchar("subdomain", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).notNull().default("provisioning"),
  // provisioning | active | suspended | failed
  isPrimary: boolean("is_primary").notNull().default(false),
  financeOrganizationId: varchar("finance_organization_id", { length: 255 }),
  provisioningError: text("provisioning_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var ownerOrganizationAccess = pgTable(
  "owner_organization_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("owner_org_access_owner_org_unique").on(t.ownerId, t.organizationId),
    index("owner_org_access_owner_idx").on(t.ownerId),
    index("owner_org_access_tenant_idx").on(t.tenantId)
  ]
);
var tenantConfig = pgTable("tenant_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  appName: text("app_name"),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
  branding: jsonb("branding").$type(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var tenantDeployments = pgTable(
  "tenant_deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    /** Unique Docker Compose project name per tenant (e.g. stockix_tenant_acme). */
    composeProjectName: text("compose_project_name").notNull(),
    /** Internal port the tenant stack exposes to Traefik (host networking / overlay TBD). */
    internalPort: integer("internal_port").notNull(),
    /** Encrypted ciphertext at rest (`enc:v1:*`) */
    mysqlPassword: text("mysql_password").notNull(),
    /** Encrypted ciphertext at rest (`enc:v1:*`) */
    mysqlRootPassword: text("mysql_root_password").notNull(),
    /** Encrypted ciphertext at rest (`enc:v1:*`) */
    jwtSecret: text("jwt_secret").notNull(),
    /** MongoDB URL scoped to the tenant stack (e.g. mongodb://mongo/stockix). */
    mongoUrl: text("mongo_url").notNull(),
    lastError: text("last_error"),
    /** When tenant.status is partial: pos_failed | wire_failed */
    partialFailureKind: text("partial_failure_kind"),
    registrationCompletedAt: timestamp("registration_completed_at", {
      withTimezone: true
    }),
    /** Finance stack tenant id (numeric) for internal license sync. */
    financeTenantId: integer("finance_tenant_id"),
    /** Bigcapital primary warehouse id (code 10001) for POS integration defaultWarehouseId. */
    financeDefaultWarehouseId: integer("finance_default_warehouse_id"),
    /** Finance walk-in customer for POS Bigcapital sync. */
    financeWalkInCustomerId: integer("finance_walk_in_customer_id"),
    financeCashAccountId: integer("finance_cash_account_id"),
    financeCardAccountId: integer("finance_card_account_id"),
    /** POS platform organization id (Mongo ObjectId string). */
    posOrganizationId: text("pos_organization_id"),
    /** Public POS web app URL (Traefik: https://{slug}-pos.{domain}). */
    posUrl: text("pos_url"),
    /** Encrypted bootstrap Finance admin password (`enc:v1:*`) until cleared by operator. */
    financeAdminPassword: text("finance_admin_password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("tenant_deployments_tenant_id_idx").on(t.tenantId),
    uniqueIndex("tenant_deployments_compose_project_name_unique").on(
      t.composeProjectName
    )
  ]
);
var tenantProvisionEvents = pgTable(
  "tenant_provision_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    correlationId: text("correlation_id").notNull(),
    slug: text("slug"),
    tenantId: uuid("tenant_id"),
    parentTenantId: uuid("parent_tenant_id"),
    deploymentId: uuid("deployment_id"),
    phase: text("phase").notNull(),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    meta: jsonb("meta").$type(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("tpe_correlation_created_idx").on(t.correlationId, t.createdAt)]
);
var adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").notNull().references(() => owners.id),
    action: text("action").notNull(),
    targetTenantId: uuid("target_tenant_id").references(() => tenants.id),
    targetOwnerId: uuid("target_owner_id").references(() => owners.id),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("admin_audit_log_actor_created_idx").on(t.actorId, t.createdAt),
    index("admin_audit_log_tenant_created_idx").on(t.targetTenantId, t.createdAt),
    index("admin_audit_log_owner_created_idx").on(t.targetOwnerId, t.createdAt)
  ]
);
var apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 32 }).notNull(),
    keyHash: varchar("key_hash", { length: 128 }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("api_keys_key_hash_unique").on(t.keyHash),
    index("api_keys_owner_id_idx").on(t.ownerId)
  ]
);
var apiIdempotencyKeys = pgTable(
  "api_idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    actorId: uuid("actor_id").notNull().references(() => owners.id, {
      onDelete: "cascade"
    }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    requestHash: text("request_hash").notNull(),
    statusCode: integer("status_code").notNull(),
    responseBody: jsonb("response_body").$type(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (t) => [
    uniqueIndex("api_idempotency_keys_actor_key_unique").on(t.actorId, t.key),
    index("api_idempotency_keys_actor_created_idx").on(t.actorId, t.createdAt),
    index("api_idempotency_keys_expires_idx").on(t.expiresAt)
  ]
);
var tenantLifecycleJobs = pgTable(
  "tenant_lifecycle_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    correlationId: text("correlation_id"),
    payload: jsonb("payload").$type().notNull(),
    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("tenant_lifecycle_jobs_status_run_at_idx").on(t.status, t.runAt, t.priority),
    index("tenant_lifecycle_jobs_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("tenant_lifecycle_jobs_correlation_created_idx").on(t.correlationId, t.createdAt)
  ]
);
var plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    maxOrganizations: integer("max_organizations").notNull().default(1),
    maxActivations: integer("max_activations").notNull().default(1),
    maxUsers: integer("max_users").notNull().default(999),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Price in smallest currency unit (e.g. cents). Null = custom / not set. */
    priceMonthly: integer("price_monthly"),
    priceAnnually: integer("price_annually"),
    currency: text("currency").default("USD"),
    billingInterval: text("billing_interval"),
    isPublic: boolean("is_public").notNull().default(false),
    /** JSON array of feature strings for display. */
    features: text("features"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("plans_slug_unique").on(t.slug)]
);
var licenses = pgTable(
  "licenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    licenseKey: text("license_key").notNull(),
    /** `stkx` legacy random keys; `stxi` tenant+location+checksum keys. */
    keyFormat: text("key_format").notNull().default("stkx"),
    /** POS location ObjectId string when key is location-scoped (STXI). */
    scopedLocationId: text("scoped_location_id"),
    product: text("product").notNull().default("platform"),
    /** JSON array of product modules this license grants. */
    modules: text("modules").notNull().default('["accounting"]'),
    planSlug: text("plan_slug").notNull().default("starter"),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null"
    }),
    status: text("status").notNull().default("unassigned"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isPerpetual: boolean("is_perpetual").notNull().default(false),
    maxActivations: integer("max_activations").notNull().default(1),
    maxOrganizations: integer("max_organizations").notNull().default(1),
    maxUsers: integer("max_users"),
    // -1 = unlimited
    activationCount: integer("activation_count").notNull().default(0),
    gracePeriodDays: integer("grace_period_days").notNull().default(7),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => owners.id, {
      onDelete: "set null"
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: uuid("revoked_by_id").references(() => owners.id, {
      onDelete: "set null"
    }),
    revokeReason: text("revoke_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("licenses_key_unique").on(t.licenseKey),
    index("licenses_tenant_id_idx").on(t.tenantId),
    index("licenses_tenant_status_idx").on(t.tenantId, t.status),
    index("licenses_status_idx").on(t.status),
    index("licenses_product_idx").on(t.product),
    index("licenses_expires_at_idx").on(t.expiresAt)
  ]
);
var ownerNotifications = pgTable(
  "owner_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    licenseId: uuid("license_id").references(() => licenses.id, { onDelete: "set null" }),
    correlationId: text("correlation_id"),
    actionUrl: text("action_url"),
    actionLabel: text("action_label"),
    readAt: timestamp("read_at", { withTimezone: true }),
    meta: jsonb("meta").$type(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("owner_notifications_owner_id_idx").on(t.ownerId),
    index("owner_notifications_owner_unread_idx").on(t.ownerId, t.readAt),
    index("owner_notifications_created_at_idx").on(t.createdAt),
    index("owner_notifications_owner_created_idx").on(t.ownerId, t.createdAt)
  ]
);
var emailLogs = pgTable(
  "email_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateKey: text("template_key").notNull(),
    recipientHash: text("recipient_hash").notNull(),
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id"),
    deliveryStatus: text("delivery_status"),
    error: text("error"),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("email_logs_created_at_idx").on(t.createdAt),
    index("email_logs_template_key_idx").on(t.templateKey),
    index("email_logs_provider_message_id_idx").on(t.providerMessageId),
    index("email_logs_tenant_id_idx").on(t.tenantId)
  ]
);
var licenseHistory = pgTable(
  "license_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    licenseId: uuid("license_id").notNull().references(() => licenses.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    previousValues: text("previous_values"),
    newValues: text("new_values"),
    notes: text("notes"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("license_history_license_id_idx").on(t.licenseId),
    index("license_history_created_at_idx").on(t.createdAt)
  ]
);
var licenseActivations = pgTable(
  "license_activations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    licenseId: uuid("license_id").notNull().references(() => licenses.id, {
      onDelete: "cascade"
    }),
    hardwareFingerprint: text("hardware_fingerprint").notNull(),
    machineName: text("machine_name"),
    ipAddress: text("ip_address"),
    activationStatus: text("activation_status").notNull().default("active"),
    offlineToken: text("offline_token"),
    offlineTokenExpiresAt: timestamp("offline_token_expires_at", {
      withTimezone: true
    }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    deactivatedById: uuid("deactivated_by_id").references(() => owners.id, {
      onDelete: "set null"
    }),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("lic_act_license_id_idx").on(t.licenseId),
    index("lic_act_fingerprint_idx").on(t.hardwareFingerprint),
    uniqueIndex("lic_act_license_fingerprint_unique").on(
      t.licenseId,
      t.hardwareFingerprint
    )
  ]
);
var blacklistedFingerprints = pgTable(
  "blacklisted_fingerprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hardwareFingerprint: text("hardware_fingerprint").notNull(),
    reason: text("reason"),
    blacklistedById: uuid("blacklisted_by_id").references(() => owners.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("blacklisted_fp_unique").on(t.hardwareFingerprint)]
);
var pmsProperties = pgTable(
  "pms_properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** hotel | hostel | villa | apartment | guesthouse | resort */
    type: text("type").notNull().default("hotel"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    description: text("description"),
    /** 24h format, e.g. "14:00" */
    checkInTime: text("check_in_time").notNull().default("14:00"),
    checkOutTime: text("check_out_time").notNull().default("12:00"),
    minNights: integer("min_nights").notNull().default(1),
    /** Days forward from today to accept bookings via OTA iCal. */
    bookingWindow: integer("booking_window").notNull().default(365),
    cleaningEnabled: boolean("cleaning_enabled").notNull().default(true),
    /** Durable slug for iCal export URL — set once, never changes. */
    feedSlug: text("feed_slug").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_properties_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_properties_feed_slug_unique").on(t.feedSlug)
  ]
);
var pmsRooms = pgTable(
  "pms_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => pmsProperties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** standard | deluxe | suite | dormitory | villa */
    type: text("type").notNull().default("standard"),
    capacity: integer("capacity").notNull().default(2),
    rateCents: integer("rate_cents").notNull().default(0),
    /** available | occupied | maintenance | cleaning */
    status: text("status").notNull().default("available"),
    description: text("description"),
    /** JSON array of amenity strings, e.g. ["wifi","ac","minibar"] */
    amenities: text("amenities").notNull().default("[]"),
    floor: integer("floor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_rooms_tenant_idx").on(t.tenantId),
    index("pms_rooms_property_idx").on(t.propertyId)
  ]
);
var pmsGuests = pgTable(
  "pms_guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    // Compliance / registration fields (passport, visa)
    nationality: text("nationality"),
    dateOfBirth: text("date_of_birth"),
    /** passport | national_id | driving_license */
    idType: text("id_type"),
    idNumber: text("id_number"),
    passportNumber: text("passport_number"),
    passportExpiry: text("passport_expiry"),
    issuedBy: text("issued_by"),
    visaNumber: text("visa_number"),
    visaFrom: text("visa_from"),
    visaTo: text("visa_to"),
    hasVisa: boolean("has_visa").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("pms_guests_tenant_idx").on(t.tenantId)]
);
var pmsBookings = pgTable(
  "pms_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => pmsProperties.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").notNull().references(() => pmsRooms.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id").notNull().references(() => pmsGuests.id, { onDelete: "cascade" }),
    checkIn: text("check_in").notNull(),
    checkOut: text("check_out").notNull(),
    totalAmountCents: integer("total_amount_cents").notNull().default(0),
    /** confirmed | checked_in | checked_out | cancelled | no_show */
    bookingStatus: text("booking_status").notNull().default("confirmed"),
    /** pending | partial | paid | refunded */
    paymentStatus: text("payment_status").notNull().default("pending"),
    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),
    /** direct | airbnb | booking | vrbo | expedia | other */
    platform: text("platform").notNull().default("direct"),
    specialRequests: text("special_requests"),
    notes: text("notes"),
    /** Actual check-in/out timestamps recorded at the front desk. */
    checkInActualAt: timestamp("check_in_actual_at", { withTimezone: true }),
    checkOutActualAt: timestamp("check_out_actual_at", { withTimezone: true }),
    /** pending | synced | failed — Finance SaleReceipt sync state. */
    accountingSyncStatus: text("accounting_sync_status").notNull().default("pending"),
    /** Finance SaleReceipt id after successful sync. */
    financeReceiptId: integer("finance_receipt_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_bookings_tenant_idx").on(t.tenantId),
    index("pms_bookings_property_idx").on(t.propertyId),
    index("pms_bookings_status_idx").on(t.bookingStatus),
    index("pms_bookings_check_in_idx").on(t.checkIn)
  ]
);
var pmsPayments = pgTable(
  "pms_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").notNull().references(() => pmsBookings.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    /** cash | card | bank_transfer | online | other */
    method: text("method").notNull().default("cash"),
    /** completed | pending | refunded | failed */
    status: text("status").notNull().default("completed"),
    transactionId: text("transaction_id"),
    /** Finance SalePayment id after sync. */
    financePaymentId: integer("finance_payment_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_payments_tenant_idx").on(t.tenantId),
    index("pms_payments_booking_idx").on(t.bookingId)
  ]
);
var pmsIcalChannels = pgTable(
  "pms_ical_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => pmsProperties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** airbnb | booking | vrbo | expedia | direct | other */
    platform: text("platform").notNull().default("other"),
    importUrl: text("import_url"),
    exportToken: text("export_token").notNull(),
    /** Days to block before a booking starts (cleaning buffer). */
    bufferBefore: integer("buffer_before").notNull().default(1),
    /** Days to block after a booking ends (cleaning buffer). */
    bufferAfter: integer("buffer_after").notNull().default(1),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    failureCount: integer("failure_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_ical_channels_tenant_idx").on(t.tenantId),
    index("pms_ical_channels_property_idx").on(t.propertyId),
    uniqueIndex("pms_ical_export_token_unique").on(t.exportToken)
  ]
);
var pmsCalendarEvents = pgTable(
  "pms_calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => pmsProperties.id, { onDelete: "cascade" }),
    /** Source platform slug (airbnb, booking, etc.) */
    platform: text("platform").notNull(),
    /** iCal UID — unique per property+platform, used for upsert/dedup. */
    icalUid: text("ical_uid").notNull(),
    summary: text("summary").notNull().default(""),
    /** YYYY-MM-DD inclusive start. */
    startDate: text("start_date").notNull(),
    /** YYYY-MM-DD exclusive end (iCal convention). */
    endDate: text("end_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_cal_events_tenant_idx").on(t.tenantId),
    index("pms_cal_events_property_platform_idx").on(t.propertyId, t.platform),
    uniqueIndex("pms_cal_events_uid_unique").on(t.propertyId, t.platform, t.icalUid)
  ]
);
var pmsSyncLogs = pgTable(
  "pms_sync_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "set null"
    }),
    /** info | warn | error | success */
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_sync_logs_tenant_idx").on(t.tenantId),
    index("pms_sync_logs_property_idx").on(t.propertyId)
  ]
);
var pmsDateOverrides = pgTable(
  "pms_date_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => pmsProperties.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD */
    date: text("date").notNull(),
    /** open | closed */
    type: text("type").notNull().default("closed"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_date_overrides_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_date_overrides_property_date_unique").on(t.propertyId, t.date)
  ]
);
var pmsStaff = pgTable(
  "pms_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** receptionist | manager | housekeeping | maintenance */
    role: text("role").notNull().default("receptionist"),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("pms_staff_tenant_idx").on(t.tenantId)]
);
var pmsCleaners = pgTable(
  "pms_cleaners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("pms_cleaners_tenant_idx").on(t.tenantId)]
);
var pmsCleanerAssignments = pgTable(
  "pms_cleaner_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => pmsProperties.id, { onDelete: "cascade" }),
    cleanerId: uuid("cleaner_id").notNull().references(() => pmsCleaners.id, { onDelete: "cascade" }),
    /** 0 = primary cleaner, 1 = first backup, etc. */
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_cleaner_assignments_tenant_idx").on(t.tenantId),
    index("pms_cleaner_assignments_property_idx").on(t.propertyId),
    uniqueIndex("pms_cleaner_assignments_property_cleaner_unique").on(
      t.propertyId,
      t.cleanerId
    )
  ]
);
var pmsCleaningTasks = pgTable(
  "pms_cleaning_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "set null"
    }),
    roomId: uuid("room_id").notNull().references(() => pmsRooms.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD */
    scheduledDate: text("scheduled_date").notNull(),
    /** pending | in_progress | done | skipped */
    status: text("status").notNull().default("pending"),
    assigneeId: uuid("assignee_id").references(() => pmsStaff.id, {
      onDelete: "set null"
    }),
    cleanerId: uuid("cleaner_id").references(() => pmsCleaners.id, {
      onDelete: "set null"
    }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    /** JSON array of photo URLs captured at completion. */
    photos: text("photos").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_cleaning_tasks_tenant_idx").on(t.tenantId),
    index("pms_cleaning_tasks_date_idx").on(t.scheduledDate)
  ]
);
var pmsPropertyManagers = pgTable(
  "pms_property_managers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => pmsProperties.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").notNull().references(() => pmsStaff.id, { onDelete: "cascade" }),
    grantedById: uuid("granted_by_id").references(() => owners.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_property_managers_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_property_managers_property_staff_unique").on(
      t.propertyId,
      t.staffId
    )
  ]
);
var pmsPropertyManagerInvites = pgTable(
  "pms_property_manager_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => pmsProperties.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdById: uuid("created_by_id").references(() => owners.id, {
      onDelete: "set null"
    }),
    /** Filled once the invite is accepted. */
    acceptedByStaffId: uuid("accepted_by_staff_id").references(() => pmsStaff.id, {
      onDelete: "set null"
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_pm_invites_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_pm_invites_token_unique").on(t.token)
  ]
);
var pmsMessageTemplates = pgTable(
  "pms_message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "cascade"
    }),
    name: text("name").notNull(),
    /** email | sms | whatsapp */
    channel: text("channel").notNull().default("email"),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull(),
    /** pre_arrival | check_in | check_out | post_stay | custom */
    trigger: text("trigger").notNull().default("custom"),
    /** Days offset from trigger event (negative = before). */
    sendOffsetDays: integer("send_offset_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_message_templates_tenant_idx").on(t.tenantId),
    index("pms_message_templates_property_idx").on(t.propertyId)
  ]
);
var pmsGuestFormTemplates = pgTable(
  "pms_guest_form_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "cascade"
    }),
    name: text("name").notNull(),
    /** JSON array of {id,type,label,required,helpText?,options?} */
    fields: text("fields").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_guest_form_templates_tenant_idx").on(t.tenantId),
    index("pms_guest_form_templates_property_idx").on(t.propertyId)
  ]
);
var pmsGuestFormSubmissions = pgTable(
  "pms_guest_form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").notNull().references(() => pmsBookings.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").notNull().references(() => pmsGuestFormTemplates.id, { onDelete: "cascade" }),
    /** Unguessable 32-char base64url — possession is the only auth. */
    shareToken: text("share_token").notNull(),
    /** JSON array of {fieldId,type,label,value} — null until submitted. */
    answers: text("answers"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("pms_guest_form_submissions_tenant_idx").on(t.tenantId),
    index("pms_guest_form_submissions_booking_idx").on(t.bookingId),
    uniqueIndex("pms_guest_form_submissions_token_unique").on(t.shareToken)
  ]
);

// ../../packages/db/src/allocate-tenant-port.ts
import { sql } from "drizzle-orm";
var TenantPortExhaustedError = class extends Error {
  constructor(maxPort) {
    super(
      `No tenant ports left (sequence exceeded MAX_TENANT_PORT=${maxPort}). Raise the sequence MAXVALUE or MAX_TENANT_PORT.`
    );
    this.name = "TenantPortExhaustedError";
  }
};
async function allocateTenantPort(db, maxPort) {
  const rows = await db.execute(
    sql`SELECT nextval('tenant_port_seq')::int AS "port"`
  );
  const row = rows[0];
  const port = row?.port;
  if (typeof port !== "number" || !Number.isFinite(port) || port > maxPort) {
    throw new TenantPortExhaustedError(maxPort);
  }
  return port;
}

// ../../packages/db/src/organization-number.ts
var ORG_NUMBER_PATTERN = /^ORG-(\d+)$/;
async function allocateOrganizationNumber(db) {
  const rows = await db.select({ organizationNumber: tenants.organizationNumber }).from(tenants);
  let max = 0;
  for (const row of rows) {
    const value = row.organizationNumber;
    if (!value) continue;
    const match = value.match(ORG_NUMBER_PATTERN);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return `ORG-${String(max + 1).padStart(5, "0")}`;
}

// ../../packages/db/src/index.ts
function createDb(connectionString) {
  const client = postgres(connectionString);
  return drizzle(client, { schema: schema_exports });
}

// ../../infra/worker-service/src/worker.ts
import { and as and4, eq as eq16, sql as sql4, isNotNull as isNotNull2, lte as lte2 } from "drizzle-orm";

// src/license-expire-followup.ts
import { and as and3, eq as eq9, gte as gte2, isNotNull, lte } from "drizzle-orm";

// src/license-constants.ts
var DEFAULT_GRACE_PERIOD_DAYS = 7;
var DEFAULT_MAX_USERS = 999;
var LICENSE_EXPIRY_MILESTONE_DAYS = [90, 60, 30, 15, 7, 3, 2, 1];
function readDefaultLicenseTermDays() {
  const raw = process.env.DEFAULT_LICENSE_TERM_DAYS?.trim();
  const n = raw ? Number(raw) : 365;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 365;
}
var DEFAULT_LICENSE_TERM_DAYS = readDefaultLicenseTermDays();

// src/license-utils.ts
import { randomBytes as randomBytes2 } from "crypto";

// ../../packages/shared/src/stxi-license-key.ts
import { createHmac } from "crypto";

// src/license-utils.ts
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
var LICENSE_MODULE_IDS = ["accounting", "pos", "pms", "chat"];
function parseLicenseModulesJson(raw) {
  if (!raw?.trim()) return ["accounting"];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ["accounting"];
    const filtered = parsed.filter(
      (m) => typeof m === "string" && LICENSE_MODULE_IDS.includes(m)
    );
    return filtered.length > 0 ? filtered : ["accounting"];
  } catch {
    return ["accounting"];
  }
}
async function getActiveLicenseForTenant(db, tenantId) {
  const perpetual = await db.select().from(licenses).where(
    and(
      eq(licenses.tenantId, tenantId),
      eq(licenses.status, "active"),
      eq(licenses.isPerpetual, true)
    )
  ).orderBy(desc(licenses.activatedAt)).limit(1);
  if (perpetual[0]) return perpetual[0];
  const now = /* @__PURE__ */ new Date();
  const active = await db.select().from(licenses).where(
    and(
      eq(licenses.tenantId, tenantId),
      eq(licenses.status, "active"),
      eq(licenses.isPerpetual, false),
      or(isNull(licenses.expiresAt), gt(licenses.expiresAt, now))
    )
  ).orderBy(desc(licenses.expiresAt)).limit(1);
  if (active[0]) return active[0];
  const expired = await db.select().from(licenses).where(and(eq(licenses.tenantId, tenantId), eq(licenses.status, "expired"))).orderBy(desc(licenses.expiresAt)).limit(1);
  if (expired[0]) return expired[0];
  return null;
}
async function getLicenseExpiry(db, tenantId) {
  const lic = await getActiveLicenseForTenant(db, tenantId);
  if (!lic) return null;
  if (lic.isPerpetual) {
    const far = /* @__PURE__ */ new Date();
    far.setUTCFullYear(far.getUTCFullYear() + 100);
    return far;
  }
  return lic.expiresAt ?? null;
}
async function getPlanLimits(db, planSlug) {
  const row = await db.select({
    maxOrganizations: plans.maxOrganizations,
    maxActivations: plans.maxActivations,
    maxUsers: plans.maxUsers
  }).from(plans).where(eq(plans.slug, planSlug)).limit(1);
  if (!row[0]) {
    console.warn(`[getPlanLimits] Plan slug "${planSlug}" not found. Using defaults.`);
    return { maxOrganizations: 1, maxActivations: 1, maxUsers: 999 };
  }
  return {
    maxOrganizations: row[0].maxOrganizations,
    maxActivations: row[0].maxActivations,
    maxUsers: row[0].maxUsers
  };
}
async function isLicenseLimitsConsistentWithPlan(db, license) {
  const planLimits = await getPlanLimits(db, license.planSlug);
  return license.maxOrganizations === planLimits.maxOrganizations && license.maxActivations === planLimits.maxActivations;
}
async function insertLicenseHistory(db, entry) {
  try {
    await db.insert(licenseHistory).values({
      licenseId: entry.licenseId,
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      previousValues: entry.previousValues ? JSON.stringify(entry.previousValues) : null,
      newValues: entry.newValues ? JSON.stringify(entry.newValues) : null,
      notes: entry.notes ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null
    });
  } catch (err) {
    console.error("[LicenseHistory] Failed to insert:", err);
  }
}

// src/license-finance-sync.ts
import { eq as eq4 } from "drizzle-orm";

// ../../infra/worker-service/domain/provisioning/adapters/sync-finance-license.ts
var FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS = 999;
var FinanceLicenseSyncError = class extends Error {
  constructor(message, detail) {
    super(message);
    this.detail = detail;
    this.name = "FinanceLicenseSyncError";
  }
  detail;
  code = "FINANCE_LICENSE_SYNC_FAILED";
};
function isFinanceLicenseSyncOptional() {
  const flag = process.env.FINANCE_LICENSE_SYNC_OPTIONAL?.trim().toLowerCase();
  if (flag === "1" || flag === "true") {
    return apiConfig.nodeEnv === "development";
  }
  return false;
}
async function syncFinanceLicense(internalBaseUrl, payload, log) {
  const secret = apiConfig.internalApiSecret;
  if (!secret) {
    const msg = "INTERNAL_API_SECRET is not set; finance license sync is required for accounting tenants";
    if (isFinanceLicenseSyncOptional()) {
      log(`[provision] ${msg} (FINANCE_LICENSE_SYNC_OPTIONAL=1 \u2014 skipping)`);
      return;
    }
    throw new FinanceLicenseSyncError(msg);
  }
  if (typeof payload.maxOrganizations !== "number" || typeof payload.maxActivations !== "number") {
    throw new FinanceLicenseSyncError(
      "maxOrganizations and maxActivations are required on finance license sync payload"
    );
  }
  const url = `${internalBaseUrl.replace(/\/+$/, "")}/api/internal/license/sync`;
  const body = {
    tenantId: payload.tenantId,
    planSlug: payload.planSlug ?? "owner-managed",
    status: payload.status ?? "active",
    validFrom: payload.validFrom ?? (/* @__PURE__ */ new Date()).toISOString(),
    expiresAt: payload.expiresAt ?? null,
    gracePeriodDays: payload.gracePeriodDays ?? 30,
    maxUsers: payload.maxUsers ?? FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS,
    maxActivations: payload.maxActivations,
    maxOrganizations: payload.maxOrganizations,
    isPerpetual: payload.isPerpetual ?? true,
    featureFlags: payload.featureFlags ?? null
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      const text2 = await res.text();
      const detail = `HTTP ${res.status} ${text2.slice(0, 200)}`;
      log(`[provision] finance license sync failed: ${detail}`);
      if (isFinanceLicenseSyncOptional()) {
        log("[provision] FINANCE_LICENSE_SYNC_OPTIONAL=1 \u2014 continuing despite sync failure");
        return;
      }
      throw new FinanceLicenseSyncError(
        `Finance license sync failed for tenant ${payload.tenantId}`,
        detail
      );
    }
    log(`[provision] finance license synced for tenant ${payload.tenantId}`);
  } catch (error) {
    if (error instanceof FinanceLicenseSyncError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    log(`[provision] finance license sync error: ${detail}`);
    if (isFinanceLicenseSyncOptional()) {
      log("[provision] FINANCE_LICENSE_SYNC_OPTIONAL=1 \u2014 continuing despite sync error");
      return;
    }
    throw new FinanceLicenseSyncError(
      `Finance license sync error for tenant ${payload.tenantId}`,
      detail
    );
  }
}

// src/finance-license.client.ts
import { eq as eq2 } from "drizzle-orm";
var FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS2 = DEFAULT_MAX_USERS;
function resolveFinanceLicenseLimitFields(license, planLimits) {
  let maxOrganizations = license?.maxOrganizations ?? planLimits.maxOrganizations;
  let maxActivations = license?.maxActivations ?? planLimits.maxActivations;
  if (license?.maxOrganizations === 1 && planLimits.maxOrganizations !== 1) {
    maxOrganizations = planLimits.maxOrganizations;
  }
  if (license?.maxActivations === 1 && planLimits.maxActivations !== 1) {
    maxActivations = planLimits.maxActivations;
  }
  return {
    maxUsers: license?.maxUsers ?? planLimits.maxUsers ?? FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS2,
    maxOrganizations,
    maxActivations
  };
}
function mapStockixLicenseStatus(license, tenantStatus) {
  if (tenantStatus === "suspended") {
    return "suspended";
  }
  if (!license) {
    return "active";
  }
  if (license.status === "revoked") {
    return "revoked";
  }
  if (license.status === "suspended") {
    return "suspended";
  }
  if (license.isPerpetual) {
    return "active";
  }
  if (license.expiresAt) {
    const now = /* @__PURE__ */ new Date();
    const graceEnd = new Date(license.expiresAt);
    graceEnd.setDate(graceEnd.getDate() + (license.gracePeriodDays ?? 7));
    const pastExpiry = license.expiresAt <= now;
    if (pastExpiry && now <= graceEnd) {
      return "grace";
    }
    if (pastExpiry) {
      return "expired";
    }
  }
  if (license.status === "expired") {
    return "expired";
  }
  return "active";
}
async function resolveTenantInternalBaseUrl(db, stockixTenantId) {
  const [deployment] = await db.select({ internalPort: tenantDeployments.internalPort }).from(tenantDeployments).where(eq2(tenantDeployments.tenantId, stockixTenantId)).limit(1);
  if (!deployment?.internalPort) {
    return null;
  }
  const host = process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? "127.0.0.1";
  return `http://${host}:${deployment.internalPort}`;
}
async function syncFinanceLicenseForStockixTenant(db, params, log = () => {
}) {
  const secret = apiConfig.internalApiSecret;
  if (!secret) {
    log("[finance-license] INTERNAL_API_SECRET not configured; skipping sync");
    return;
  }
  const internalBaseUrl = params.internalBaseUrl ?? await resolveTenantInternalBaseUrl(db, params.stockixTenantId);
  if (!internalBaseUrl) {
    log("[finance-license] No internal base URL; skipping sync");
    return;
  }
  const license = await getActiveLicenseForTenant(db, params.stockixTenantId);
  const [tenantRow] = await db.select({ status: tenants.status, planSlug: tenants.planSlug }).from(tenants).where(eq2(tenants.id, params.stockixTenantId)).limit(1);
  const planSlug = license?.planSlug ?? tenantRow?.planSlug ?? "owner-managed";
  const planLimits = await getPlanLimits(db, planSlug);
  if (license) {
    const isConsistent = await isLicenseLimitsConsistentWithPlan(db, license);
    if (!isConsistent) {
      log(
        `[LicenseSync] License limits differ from plan limits for license ${license.id}, tenant ${license.tenantId ?? "none"} \u2014 plan limits will be applied for sync`
      );
    }
  }
  const payload = {
    tenantId: params.financeTenantId,
    planSlug,
    status: mapStockixLicenseStatus(
      license ? {
        status: license.status,
        isPerpetual: license.isPerpetual,
        expiresAt: license.expiresAt,
        gracePeriodDays: license.gracePeriodDays
      } : null,
      tenantRow?.status
    ),
    validFrom: (license?.validFrom ?? /* @__PURE__ */ new Date()).toISOString(),
    expiresAt: license?.expiresAt?.toISOString() ?? null,
    gracePeriodDays: license?.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS,
    ...resolveFinanceLicenseLimitFields(license, planLimits),
    isPerpetual: license?.isPerpetual ?? false,
    featureFlags: null
  };
  const url = `${internalBaseUrl.replace(/\/+$/, "")}/api/internal/license/sync`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      const text2 = await res.text();
      const detail = `HTTP ${res.status} ${text2.slice(0, 300)}`;
      log(`[finance-license] Sync failed ${detail}`);
      if (isFinanceLicenseSyncOptional()) {
        log("[finance-license] FINANCE_LICENSE_SYNC_OPTIONAL=1 \u2014 continuing");
        return;
      }
      throw new Error(`Finance license sync failed for tenant ${params.financeTenantId}: ${detail}`);
    }
    log(`[finance-license] Synced license for finance tenant ${params.financeTenantId}`);
    if (license) {
      await insertLicenseHistory(db, {
        licenseId: license.id,
        action: "synced_to_finance",
        newValues: {
          syncedStatus: payload.status,
          maxOrganizations: payload.maxOrganizations,
          maxUsers: payload.maxUsers,
          maxActivations: payload.maxActivations,
          planSlug: payload.planSlug
        }
      });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log(`[finance-license] Sync error: ${detail}`);
    if (!isFinanceLicenseSyncOptional()) {
      throw error instanceof Error ? error : new Error(detail);
    }
  }
}

// src/mail/send.ts
import { eq as eq3 } from "drizzle-orm";

// src/mail/mailer.ts
import { createTransport } from "nodemailer";
var mailer = createTransport({
  host: mailConfig.host || "smtp.resend.com",
  port: mailConfig.port,
  secure: mailConfig.secure,
  auth: {
    user: mailConfig.username || "resend",
    pass: mailConfig.password
  },
  connectionTimeout: 1e4,
  greetingTimeout: 1e4,
  socketTimeout: 3e4
});
function formatFromHeader() {
  return `${mailConfig.fromName} <${mailConfig.fromAddress}>`;
}
var logEmailAttemptFn = null;
async function sendMail(options) {
  const templateKey = options.templateKey ?? "unknown";
  if (!isMailConfigured()) {
    console.warn(
      `[mail] ${templateKey}: MAIL_PASSWORD or MAIL_FROM_ADDRESS not set; skipping send`
    );
    const result = { status: "skipped", reason: "not_configured" };
    if (logEmailAttemptFn) {
      await logEmailAttemptFn({
        templateKey,
        to: options.to,
        result,
        idempotencyKey: options.idempotencyKey,
        tenantId: options.tenantId,
        ownerId: options.ownerId
      }).catch((err) => {
        console.error("[mail] email log failed:", err instanceof Error ? err.message : err);
      });
    }
    return result;
  }
  try {
    const info = await mailer.sendMail({
      from: formatFromHeader(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      headers: options.idempotencyKey ? { "Resend-Idempotency-Key": options.idempotencyKey } : void 0
    });
    const messageId = typeof info.messageId === "string" ? info.messageId : void 0;
    const result = { status: "sent", messageId };
    if (logEmailAttemptFn) {
      await logEmailAttemptFn({
        templateKey,
        to: options.to,
        result,
        idempotencyKey: options.idempotencyKey,
        tenantId: options.tenantId,
        ownerId: options.ownerId
      }).catch((err) => {
        console.error("[mail] email log failed:", err instanceof Error ? err.message : err);
      });
    }
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[mail] ${templateKey}: send failed:`, error);
    const result = { status: "failed", error };
    if (logEmailAttemptFn) {
      await logEmailAttemptFn({
        templateKey,
        to: options.to,
        result,
        idempotencyKey: options.idempotencyKey,
        tenantId: options.tenantId,
        ownerId: options.ownerId
      }).catch((logErr) => {
        console.error("[mail] email log failed:", logErr instanceof Error ? logErr.message : logErr);
      });
    }
    return result;
  }
}
function mailSendSucceeded(result) {
  return result.status === "sent";
}

// src/mail/templates/license-expiring.ts
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}
function renderLicenseExpiring(props) {
  const expiresDate = formatDate(props.expiresAt);
  const dayLabel = props.daysRemaining === 1 ? "day" : "days";
  const tenantName = escapeHtml(props.tenantName);
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #111; max-width: 560px;">
  <h1 style="font-size: 1.25rem; margin-bottom: 1rem;">Your Stockix license expires soon</h1>
  <p>Hi ${tenantName},</p>
  <p>
    Your Stockix license will expire in
    <strong>${props.daysRemaining} ${dayLabel}</strong>
    on <strong>${escapeHtml(expiresDate)}</strong>.
  </p>
  <p>
    To avoid any interruption to your service, please renew your
    license before the expiry date.
  </p>
  <p>
    After expiry you will have a grace period during which your
    account will be read-only. After the grace period ends your
    account will be fully locked.
  </p>
  <p>Please contact your administrator to renew.</p>
  <p style="color: #666; font-size: 0.875rem; margin-top: 2rem;">
    This is an automated message from Stockix.
    Please do not reply to this email.
  </p>
</body>
</html>`;
}

// src/mail/templates/license-expired.ts
function escapeHtml2(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function formatDate2(date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}
function renderLicenseExpired(props) {
  const expiredDate = formatDate2(props.expiredAt);
  const graceEndsDate = formatDate2(props.graceEndsAt);
  const tenantName = escapeHtml2(props.tenantName);
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #111; max-width: 560px;">
  <h1 style="font-size: 1.25rem; margin-bottom: 1rem;">Your Stockix license has expired</h1>
  <p>Hi ${tenantName},</p>
  <p>Your Stockix license expired on <strong>${escapeHtml2(expiredDate)}</strong>.</p>
  <p>
    You are currently in <strong>read-only mode</strong> \u2014 you can view
    your existing data but cannot create or edit records.
  </p>
  <p>
    Your grace period ends on <strong>${escapeHtml2(graceEndsDate)}</strong>.
    After this date your account will be fully locked.
  </p>
  <p>
    Please contact your administrator to renew your license and
    restore full access.
  </p>
  <p style="color: #666; font-size: 0.875rem; margin-top: 2rem;">
    This is an automated message from Stockix.
    Please do not reply to this email.
  </p>
</body>
</html>`;
}

// src/mail/send.ts
function escapeHtml3(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function sendPosWelcomeEmail(opts) {
  const brandName = process.env.BRAND_NAME ?? "Stockix";
  const safeTenant = escapeHtml3(opts.tenantName);
  const safePosUrl = escapeHtml3(opts.posUrl);
  const credentialRows = opts.credentials.map(
    (c) => `<tr>
        <td>${escapeHtml3(c.role)}</td>
        <td>${escapeHtml3(c.username)}</td>
        <td><strong>${escapeHtml3(c.pin)}</strong></td>
      </tr>`
  ).join("");
  return sendMail({
    to: opts.to,
    subject: `Your ${brandName} POS staff credentials`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #111; max-width: 600px;">
  <h1 style="font-size: 22px;">POS staff login credentials</h1>
  <p>Hello,</p>
  <p>Your <strong>${safeTenant}</strong> Point of Sale system is ready.</p>
  <p><strong>POS URL:</strong> <a href="${safePosUrl}">${safePosUrl}</a></p>
  <p>Staff log in using their role PIN code:</p>
  <table cellpadding="8" cellspacing="0" border="1" style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <thead>
      <tr style="background: #f4f4f5;">
        <th align="left">Role</th>
        <th align="left">Username</th>
        <th align="left">PIN</th>
      </tr>
    </thead>
    <tbody>${credentialRows}</tbody>
  </table>
  <p style="color: #b45309;"><strong>Security:</strong> Share each PIN only with the relevant staff member.
  PINs can be changed from the admin panel. Do not forward this email to staff directly.</p>
  <p style="color: #666; font-size: 14px;">To reset a PIN, log in as admin and go to Settings \u2192 Staff Management.</p>
</body>
</html>`,
    idempotencyKey: `pos-welcome/${opts.to}/${opts.posUrl}`,
    templateKey: "pos-welcome",
    tenantId: opts.tenantId
  });
}
async function sendLicenseExpiringEmail(opts) {
  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (opts.expiresAt.getTime() - Date.now()) / (1e3 * 60 * 60 * 24)
    )
  );
  const expiryDay = opts.expiresAt.toISOString().split("T")[0];
  const idempotencyKey = opts.idempotencyKey ?? (opts.licenseId != null && opts.milestoneDays != null ? `license-expiring/${opts.licenseId}/${opts.milestoneDays}` : `license-expiring/${opts.tenantId}/${expiryDay}`);
  const result = await sendMail({
    to: opts.to,
    subject: "Your Stockix license expires soon",
    html: renderLicenseExpiring({
      tenantName: opts.tenantName,
      expiresAt: opts.expiresAt,
      daysRemaining
    }),
    idempotencyKey,
    templateKey: "license-expiring",
    tenantId: opts.tenantId
  });
  if (!mailSendSucceeded(result)) {
    console.error(
      "[sendLicenseExpiringEmail] Send failed",
      opts.tenantId,
      result.status === "failed" ? result.error : result.status
    );
  }
  return result;
}
async function sendLicenseExpiredEmail(opts) {
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const result = await sendMail({
    to: opts.to,
    subject: "Your Stockix license has expired",
    html: renderLicenseExpired({
      tenantName: opts.tenantName,
      expiredAt: opts.expiredAt,
      gracePeriodDays: opts.gracePeriodDays,
      graceEndsAt: opts.graceEndsAt
    }),
    idempotencyKey: `license-expired/${opts.tenantId}/${today}`,
    templateKey: "license-expired",
    tenantId: opts.tenantId
  });
  if (!mailSendSucceeded(result)) {
    console.error(
      "[sendLicenseExpiredEmail] Send failed",
      opts.tenantId,
      result.status === "failed" ? result.error : result.status
    );
  }
  return result;
}
async function sendLicenseExpiredEmailForTenant(db, tenantId, opts) {
  try {
    const [tenant] = await db.select({ name: tenants.name, adminEmail: tenants.adminEmail }).from(tenants).where(eq3(tenants.id, tenantId)).limit(1);
    if (!tenant) {
      console.warn("[sendLicenseExpiredEmail] Tenant not found:", tenantId);
      return;
    }
    if (!tenant.adminEmail) {
      console.warn("[sendLicenseExpiredEmail] No admin email for tenant", tenantId);
      return;
    }
    const license = opts?.licenseId != null ? (await db.select({
      id: licenses.id,
      expiresAt: licenses.expiresAt,
      gracePeriodDays: licenses.gracePeriodDays
    }).from(licenses).where(eq3(licenses.id, opts.licenseId)).limit(1))[0] : await getActiveLicenseForTenant(db, tenantId);
    const expiredAt = license?.expiresAt ?? /* @__PURE__ */ new Date();
    const gracePeriodDays = license?.gracePeriodDays ?? 7;
    const graceEndsAt = new Date(expiredAt);
    graceEndsAt.setDate(graceEndsAt.getDate() + gracePeriodDays);
    const result = await sendLicenseExpiredEmail({
      to: tenant.adminEmail,
      tenantName: tenant.name,
      tenantId,
      expiredAt,
      gracePeriodDays,
      graceEndsAt
    });
    const historyLicenseId = opts?.licenseId ?? license?.id;
    if (historyLicenseId && mailSendSucceeded(result)) {
      await insertLicenseHistory(db, {
        licenseId: historyLicenseId,
        action: "expired_email_sent",
        newValues: { to: tenant.adminEmail, expiredAt: expiredAt.toISOString() }
      });
    }
  } catch (err) {
    console.error(
      "[sendLicenseExpiredEmail] Failed for tenant",
      tenantId,
      err instanceof Error ? err.message : err
    );
  }
}
async function sendLicenseExpiringEmailForTenant(db, tenantId, opts) {
  try {
    const [tenant] = await db.select({ name: tenants.name, adminEmail: tenants.adminEmail }).from(tenants).where(eq3(tenants.id, tenantId)).limit(1);
    if (!tenant) {
      console.warn("[sendLicenseExpiringEmail] Tenant not found:", tenantId);
      return;
    }
    if (!tenant.adminEmail) {
      console.warn("[sendLicenseExpiringEmail] No admin email for tenant", tenantId);
      return;
    }
    const licenseIdForMail = opts.licenseId;
    const result = await sendLicenseExpiringEmail({
      to: tenant.adminEmail,
      tenantName: tenant.name,
      tenantId,
      expiresAt: opts.expiresAt,
      licenseId: licenseIdForMail,
      milestoneDays: opts.milestoneDays
    });
    const license = opts.licenseId != null ? (await db.select({ id: licenses.id }).from(licenses).where(eq3(licenses.id, opts.licenseId)).limit(1))[0] : await getActiveLicenseForTenant(db, tenantId);
    if (license?.id && mailSendSucceeded(result)) {
      await insertLicenseHistory(db, {
        licenseId: license.id,
        action: "expiry_warning_sent",
        newValues: {
          to: tenant.adminEmail,
          expiresAt: opts.expiresAt.toISOString(),
          ...opts.milestoneDays != null ? { milestoneDays: opts.milestoneDays } : {}
        }
      });
    }
  } catch (err) {
    console.error(
      "[sendLicenseExpiringEmail] Failed for tenant",
      tenantId,
      err instanceof Error ? err.message : err
    );
  }
}
async function sendLicenseExpiringEmailToPlatformOwner(db, tenantId, opts) {
  try {
    const [tenant] = await db.select({ name: tenants.name, ownerId: tenants.ownerId }).from(tenants).where(eq3(tenants.id, tenantId)).limit(1);
    if (!tenant?.ownerId) return;
    const [owner] = await db.select({ email: owners.email }).from(owners).where(eq3(owners.id, tenant.ownerId)).limit(1);
    if (!owner?.email) return;
    await sendLicenseExpiringEmail({
      to: owner.email,
      tenantName: tenant.name,
      tenantId,
      expiresAt: opts.expiresAt,
      licenseId: opts.licenseId,
      milestoneDays: opts.milestoneDays,
      idempotencyKey: `license-expiring-owner/${opts.licenseId}/${opts.milestoneDays}`
    });
  } catch (err) {
    console.error(
      "[sendLicenseExpiringEmailToPlatformOwner] Failed",
      tenantId,
      err instanceof Error ? err.message : err
    );
  }
}

// src/license-finance-sync.ts
async function triggerFinanceLicenseSync(db, stockixTenantId, log = console.log) {
  if (!stockixTenantId) return;
  await maybeSendLicenseGraceWarningEmail(db, stockixTenantId, log);
  const [deployment] = await db.select({ financeTenantId: tenantDeployments.financeTenantId }).from(tenantDeployments).where(eq4(tenantDeployments.tenantId, stockixTenantId)).limit(1);
  const financeTenantId = deployment?.financeTenantId;
  if (!financeTenantId || financeTenantId <= 0) {
    log(
      `[finance-license] No finance_tenant_id for Stockix tenant ${stockixTenantId}; skipping sync`
    );
    return;
  }
  await syncFinanceLicenseForStockixTenant(
    db,
    { stockixTenantId, financeTenantId },
    log
  );
}
async function maybeSendLicenseGraceWarningEmail(db, stockixTenantId, log) {
  const license = await getActiveLicenseForTenant(db, stockixTenantId);
  if (!license?.expiresAt || license.isPerpetual) {
    return;
  }
  const now = /* @__PURE__ */ new Date();
  const expiresAt = license.expiresAt;
  const graceDays = license.gracePeriodDays ?? 7;
  const graceEnds = new Date(expiresAt);
  graceEnds.setDate(graceEnds.getDate() + graceDays);
  const inGrace = expiresAt < now && now <= graceEnds && license.status !== "revoked";
  if (!inGrace) {
    return;
  }
  const [tenant] = await db.select({ name: tenants.name, adminEmail: tenants.adminEmail }).from(tenants).where(eq4(tenants.id, stockixTenantId)).limit(1);
  if (!tenant?.adminEmail) {
    return;
  }
  try {
    await sendLicenseExpiringEmail({
      to: tenant.adminEmail,
      tenantName: tenant.name,
      tenantId: stockixTenantId,
      expiresAt
    });
    log(`[mail] Sent license grace warning to ${tenant.adminEmail}`);
  } catch (err) {
    log(
      `[mail] License grace email failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// src/pos-license-sync.ts
import { eq as eq5 } from "drizzle-orm";

// src/pos-proxy.ts
var POS_PLATFORM_BASE = process.env.POS_PLATFORM_BASE_URL ?? "http://localhost:8010";
var POS_PLATFORM_KEY = process.env.POS_PLATFORM_API_KEY ?? "";
async function posProxy(path2, method, body, query) {
  const url = new URL(`${POS_PLATFORM_BASE}/api/platform/v1${path2}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== void 0 && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }
  return fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...POS_PLATFORM_KEY ? { "X-Api-Key": POS_PLATFORM_KEY } : {}
    },
    body: body !== void 0 ? JSON.stringify(body) : void 0
  });
}
async function posProxyJson(path2, method, body, query) {
  let res;
  try {
    res = await posProxy(path2, method, body, query);
  } catch (err) {
    const message = err instanceof Error ? err.message : "POS platform unreachable";
    return {
      data: {
        error: "pos_unavailable",
        message,
        hint: `Run pnpm dev from repo root (POS API ${POS_PLATFORM_BASE}, UI ${process.env.POS_FRONTEND_URL ?? "http://localhost:3001"}). First time: pnpm dev:pos:install.`
      },
      status: 503
    };
  }
  const text2 = await res.text();
  let data = {};
  if (text2) {
    try {
      data = JSON.parse(text2);
    } catch {
      data = { raw: text2 };
    }
  }
  return { data, status: res.status };
}

// src/pos-license-sync.ts
function proxyErrorMessage(data, status) {
  if (data && typeof data === "object" && "message" in data) {
    return String(data.message);
  }
  return `HTTP ${status}`;
}
async function getPosTenantLink(db, tenantId) {
  const [row] = await db.select({
    modules: tenants.modules,
    posOrganizationId: tenantDeployments.posOrganizationId
  }).from(tenants).leftJoin(tenantDeployments, eq5(tenantDeployments.tenantId, tenants.id)).where(eq5(tenants.id, tenantId)).limit(1);
  const posOrgId = row?.posOrganizationId?.trim();
  if (!posOrgId) return null;
  const modules = parseLicenseModulesJson(row?.modules);
  if (!modules.includes("pos")) return null;
  return { posOrgId, modules };
}
function logPosSyncLine(line, log) {
  if (log) log(line);
  else if (line.includes("failed")) console.error(line);
  else console.log(line);
}
async function suspendPosOrgForLicense(db, tenantId, reason, log) {
  const link = await getPosTenantLink(db, tenantId);
  if (!link) return { ok: true };
  const { data, status } = await posProxyJson(
    `/organizations/${encodeURIComponent(link.posOrgId)}/suspend`,
    "POST",
    { reason }
  );
  if (status < 200 || status >= 300) {
    const message = proxyErrorMessage(data, status);
    logPosSyncLine(
      `[pos-license-sync] suspend failed tenantId=${tenantId} posOrgId=${link.posOrgId}: ${message}`,
      log
    );
    return { ok: false, error: message };
  }
  logPosSyncLine(
    `[pos-license-sync] suspended POS org tenantId=${tenantId} posOrgId=${link.posOrgId} reason=${reason}`,
    log
  );
  return { ok: true };
}

// src/notification-service.ts
import { and as and2, asc, count, desc as desc2, eq as eq6, gte, isNull as isNull2, lt, sql as sql2 } from "drizzle-orm";
async function createNotification(db, input) {
  const [notification] = await db.insert(ownerNotifications).values({
    ownerId: input.ownerId,
    type: input.type,
    severity: input.severity,
    title: input.title,
    body: input.body,
    tenantId: input.tenantId ?? null,
    licenseId: input.licenseId ?? null,
    correlationId: input.correlationId ?? null,
    actionUrl: input.actionUrl ?? null,
    actionLabel: input.actionLabel ?? null,
    meta: input.meta ?? null
  }).returning();
  return notification ?? null;
}
function safeCreateNotification(db, input) {
  void createNotification(db, input).catch((err) => {
    console.error(
      "[notification] create failed:",
      err instanceof Error ? err.message : String(err)
    );
  });
}
async function hasLicenseExpiryMilestoneNotification(db, opts) {
  const [row] = await db.select({ c: count() }).from(ownerNotifications).where(
    and2(
      eq6(ownerNotifications.type, "license.expiring"),
      eq6(ownerNotifications.licenseId, opts.licenseId),
      sql2`${ownerNotifications.meta}->>'milestoneDays' = ${String(opts.milestoneDays)}`
    )
  );
  return Number(row?.c ?? 0) > 0;
}

// src/notification-helpers.ts
import { eq as eq8 } from "drizzle-orm";

// src/services/auth/stockix-product-token.ts
import { eq as eq7 } from "drizzle-orm";

// src/notification-helpers.ts
function licenseDetailPath(licenseId) {
  return `/licenses/${licenseId}`;
}
function notifyLicenseForTenant(db, opts) {
  void (async () => {
    const [tenant] = await db.select({ id: tenants.id, name: tenants.name, ownerId: tenants.ownerId }).from(tenants).where(eq8(tenants.id, opts.tenantId)).limit(1);
    if (!tenant) return;
    const severity = opts.type === "license.expiring" ? "warning" : opts.type === "license.suspended" ? "warning" : "error";
    const titleByType = {
      "license.expired": `License expired for ${tenant.name}`,
      "license.expiring": `License expiring soon for ${tenant.name}`,
      "license.revoked": `License revoked for ${tenant.name}`,
      "license.suspended": `License suspended for ${tenant.name}`
    };
    safeCreateNotification(db, {
      ownerId: tenant.ownerId,
      type: opts.type,
      severity,
      title: titleByType[opts.type],
      body: opts.body,
      tenantId: tenant.id,
      licenseId: opts.licenseId,
      actionUrl: licenseDetailPath(opts.licenseId),
      actionLabel: opts.type === "license.expiring" ? "Extend license" : "View license",
      meta: opts.daysLeft != null || opts.milestoneDays != null ? {
        ...opts.daysLeft != null ? { daysLeft: opts.daysLeft } : {},
        ...opts.milestoneDays != null ? { milestoneDays: opts.milestoneDays } : {}
      } : void 0
    });
  })().catch((err) => {
    console.error(
      "[notification] license notify failed:",
      err instanceof Error ? err.message : String(err)
    );
  });
}

// src/jobs/license-expiry-queue.ts
import { Queue, Worker } from "bullmq";

// src/jobs/license-expiry-milestone.ts
async function runLicenseExpiryMilestoneJob(db, job, log = console.log) {
  const expiresAt = new Date(job.expiresAt);
  const alreadyNotified = await hasLicenseExpiryMilestoneNotification(db, {
    licenseId: job.licenseId,
    milestoneDays: job.milestoneDays
  });
  if (alreadyNotified) return;
  try {
    await sendLicenseExpiringEmailForTenant(db, job.tenantId, {
      expiresAt,
      gracePeriodDays: job.gracePeriodDays,
      licenseId: job.licenseId,
      milestoneDays: job.milestoneDays
    });
    await sendLicenseExpiringEmailToPlatformOwner(db, job.tenantId, {
      expiresAt,
      licenseId: job.licenseId,
      milestoneDays: job.milestoneDays
    });
  } catch (err) {
    console.error(
      "[expireDueLicenses] Milestone email failed",
      job.tenantId,
      job.milestoneDays,
      err
    );
  }
  notifyLicenseForTenant(db, {
    tenantId: job.tenantId,
    licenseId: job.licenseId,
    type: "license.expiring",
    body: `License expires in ${job.milestoneDays} day${job.milestoneDays === 1 ? "" : "s"}. Extend now to avoid service interruption.`,
    daysLeft: job.milestoneDays,
    milestoneDays: job.milestoneDays
  });
  log(
    `[license_expiry_milestone_fired] licenseId=${job.licenseId} milestoneDays=${job.milestoneDays}`
  );
}

// src/jobs/license-expiry-queue.ts
var QUEUE_NAME = "license-expiry-milestones";
var queue = null;
function redisConnection() {
  const url = process.env.CONTROL_PLANE_REDIS_URL?.trim();
  if (!url) return null;
  return { url };
}
function getLicenseExpiryQueue() {
  const conn = redisConnection();
  if (!conn) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200
      }
    });
  }
  return queue;
}
async function enqueueLicenseExpiryMilestone(data) {
  const q = getLicenseExpiryQueue();
  const jobId = `${data.licenseId}:${data.milestoneDays}`;
  if (q) {
    await q.add("milestone", data, { jobId });
    return "queued";
  }
  return "inline";
}

// src/license-expire-followup.ts
var MS_PER_DAY = 1e3 * 60 * 60 * 24;
function daysUntilExpiry(expiresAt, now) {
  return Math.max(
    0,
    Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY)
  );
}
function pickExpiryMilestone(daysLeft) {
  for (const milestone of LICENSE_EXPIRY_MILESTONE_DAYS) {
    if (daysLeft === milestone) return milestone;
  }
  return null;
}
async function suspendTenantRecordsAfterGrace(db, tenantId, log) {
  await db.update(tenants).set({ status: "suspended" }).where(eq9(tenants.id, tenantId));
  await db.update(tenantDeployments).set({ status: "suspended" }).where(eq9(tenantDeployments.tenantId, tenantId));
  log(`[expireDueLicenses] Tenant ${tenantId} marked suspended after license grace`);
}
async function processLicenseExpiryFollowUp(db, opts) {
  const log = opts.log ?? ((message) => console.log(message));
  const now = opts.now ?? /* @__PURE__ */ new Date();
  for (const license of opts.justExpired) {
    await insertLicenseHistory(db, {
      licenseId: license.id,
      action: "expired_by_worker",
      previousValues: { status: "active" },
      newValues: { status: "expired" },
      notes: "Automatically expired by worker cron"
    });
    if (!license.tenantId) continue;
    try {
      await triggerFinanceLicenseSync(db, license.tenantId, log);
    } catch (err) {
      console.error(
        "[expireDueLicenses] Finance sync failed for tenant",
        license.tenantId,
        err
      );
    }
    if (license.expiresAt) {
      const graceEnd = new Date(license.expiresAt);
      graceEnd.setDate(graceEnd.getDate() + (license.gracePeriodDays ?? 7));
      if (now > graceEnd) {
        try {
          await suspendPosOrgForLicense(db, license.tenantId, "license_expired", log);
        } catch (err) {
          console.error(
            "[expireDueLicenses] POS suspend failed for tenant",
            license.tenantId,
            err
          );
        }
        try {
          await suspendTenantRecordsAfterGrace(db, license.tenantId, log);
        } catch (err) {
          console.error(
            "[expireDueLicenses] Tenant status suspend failed",
            license.tenantId,
            err
          );
        }
      }
    }
    try {
      await sendLicenseExpiredEmailForTenant(db, license.tenantId, { licenseId: license.id });
    } catch (err) {
      console.error(
        "[expireDueLicenses] Email failed for tenant",
        license.tenantId,
        err
      );
    }
    notifyLicenseForTenant(db, {
      tenantId: license.tenantId,
      licenseId: license.id,
      type: "license.expired",
      body: "This tenant's license has expired. Finance access is restricted until you renew or assign a new license."
    });
  }
  await processExpiringSoonWarnings(db, now);
  await processPostGracePosSuspensions(db, now, log);
}
async function processPostGracePosSuspensions(db, now, log) {
  const candidates = await db.select({
    id: licenses.id,
    tenantId: licenses.tenantId,
    expiresAt: licenses.expiresAt,
    gracePeriodDays: licenses.gracePeriodDays
  }).from(licenses).where(
    and3(
      eq9(licenses.status, "expired"),
      isNotNull(licenses.tenantId),
      isNotNull(licenses.expiresAt),
      lte(licenses.expiresAt, now)
    )
  );
  for (const license of candidates) {
    if (!license.tenantId || !license.expiresAt) continue;
    const graceEnd = new Date(license.expiresAt);
    graceEnd.setDate(graceEnd.getDate() + (license.gracePeriodDays ?? 7));
    if (now <= graceEnd) continue;
    try {
      await suspendPosOrgForLicense(db, license.tenantId, "license_grace_ended", log);
    } catch (err) {
      console.error(
        "[expireDueLicenses] Post-grace POS suspend failed for tenant",
        license.tenantId,
        err
      );
    }
    try {
      await suspendTenantRecordsAfterGrace(db, license.tenantId, log);
    } catch (err) {
      console.error(
        "[expireDueLicenses] Post-grace tenant suspend failed",
        license.tenantId,
        err
      );
    }
  }
}
async function processExpiringSoonWarnings(db, now) {
  const maxMilestone = Math.max(...LICENSE_EXPIRY_MILESTONE_DAYS);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + maxMilestone);
  const candidates = await db.select({
    id: licenses.id,
    tenantId: licenses.tenantId,
    expiresAt: licenses.expiresAt,
    gracePeriodDays: licenses.gracePeriodDays
  }).from(licenses).where(
    and3(
      eq9(licenses.status, "active"),
      eq9(licenses.isPerpetual, false),
      isNotNull(licenses.tenantId),
      isNotNull(licenses.expiresAt),
      gte2(licenses.expiresAt, now),
      lte(licenses.expiresAt, horizon)
    )
  );
  for (const license of candidates) {
    if (!license.tenantId || !license.expiresAt) continue;
    const daysLeft = daysUntilExpiry(license.expiresAt, now);
    const milestoneDays = pickExpiryMilestone(daysLeft);
    if (milestoneDays == null) continue;
    const alreadyNotified = await hasLicenseExpiryMilestoneNotification(db, {
      licenseId: license.id,
      milestoneDays
    });
    if (alreadyNotified) continue;
    const job = {
      licenseId: license.id,
      tenantId: license.tenantId,
      milestoneDays,
      expiresAt: license.expiresAt.toISOString(),
      gracePeriodDays: license.gracePeriodDays ?? 7
    };
    const mode = await enqueueLicenseExpiryMilestone(job);
    if (mode === "inline") {
      await runLicenseExpiryMilestoneJob(db, job);
    }
  }
}

// ../../infra/worker-service/src/worker.ts
import { z as z2 } from "zod";

// ../../infra/worker-service/domain/provisioning/check-tenant-images.ts
import { execa } from "execa";

// ../../infra/worker-service/domain/provisioning/required-tenant-images.ts
var REQUIRED_STOCKIX_TENANT_IMAGES = [
  "stockix-webapp:local",
  "stockix-server:local",
  "stockix-database-migration:local",
  "stockix-nginx:local"
];
var RECOMMENDED_POS_TENANT_IMAGES = [
  "stockix-pos-backend:local",
  "stockix-pos-frontend:local"
];

// ../../infra/worker-service/domain/provisioning/check-tenant-images.ts
async function imageExists(tag) {
  try {
    await execa("docker", ["image", "inspect", tag], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
async function checkRequiredTenantImages() {
  const missing = [];
  for (const image of REQUIRED_STOCKIX_TENANT_IMAGES) {
    if (!await imageExists(image)) {
      missing.push(image);
    }
  }
  if (missing.length > 0) {
    console.warn("[worker] WARNING: Required tenant images not found:");
    for (const img of missing) {
      console.warn(`[worker]   - ${img}`);
    }
    console.warn("[worker] Run: pnpm docker:prebuild");
    console.warn("[worker] Provisioning may build images during the job and time out.");
    return;
  }
  console.log("[worker] All tenant images pre-built and ready.");
  const missingPos = [];
  for (const image of RECOMMENDED_POS_TENANT_IMAGES) {
    if (!await imageExists(image)) {
      missingPos.push(image);
    }
  }
  if (missingPos.length > 0) {
    console.warn("[worker] POS module images not pre-built (POS provision will fail until built):");
    for (const img of missingPos) {
      console.warn(`[worker]   - ${img}`);
    }
    console.warn("[worker] Run: pnpm pos:images:build");
  }
}

// ../../infra/worker-service/domain/provisioner.ts
import { rm, stat } from "fs/promises";
import { join as join8 } from "path";
import { eq as eq15 } from "drizzle-orm";

// ../../infra/worker-service/domain/env-paths.ts
import { homedir } from "os";
import { join } from "path";
var isWin = process.platform === "win32";
function defaultTenantEnvRoot() {
  const override = apiConfig.tenantEnvRoot;
  if (override) return override;
  if (isWin) return join(homedir(), ".stockix", "tenants");
  if (apiConfig.nodeEnv !== "production") return join(homedir(), ".stockix", "tenants");
  return "/opt/stockix/tenants";
}

// ../../infra/worker-service/domain/provision-paths.ts
import { join as join3 } from "path";

// ../../infra/worker-service/domain/repo-root.ts
import { dirname, join as join2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { existsSync as existsSync2 } from "fs";
function getRepoRoot() {
  const override = apiConfig.repoRoot;
  if (override) return override;
  const here = dirname(fileURLToPath2(import.meta.url));
  const candidate = join2(here, "..", "..", "..");
  if (existsSync2(join2(candidate, "package.json"))) {
    return candidate;
  }
  return join2(here, "..", "..", "..", "..");
}

// ../../infra/worker-service/domain/provision-paths.ts
function getTenantStackPaths() {
  const repoRoot2 = getRepoRoot();
  const stockixFinanceRoot = apiConfig.stockixTenantAppRoot || join3(repoRoot2, "services/stockix-finance");
  return {
    repoRoot: repoRoot2,
    stockixFinanceRoot,
    tenantComposeFile: join3(repoRoot2, "infra/tenant-stack/docker-compose.yml")
  };
}

// ../../infra/worker-service/domain/provisioning/compose-project-name.ts
function composeProjectName(slug) {
  return `stockix-${slug}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}
function tenantMysqlVolumeName(slug) {
  return `${composeProjectName(slug)}-mysql`;
}

// ../../infra/worker-service/src/provision-runtime.ts
import { mkdir as mkdir3 } from "fs/promises";
import { join as join7 } from "path";
import { execa as execa3 } from "execa";

// ../../packages/shared/src/deployment-secrets.ts
import { createCipheriv, createDecipheriv, randomBytes as randomBytes3 } from "crypto";
var ENC_PREFIX = "enc:v1:";
function isEncryptedDeploymentSecret(value) {
  return value.startsWith(ENC_PREFIX);
}
function encryptDeploymentSecret(plaintext, secretKeyHex) {
  const key = Buffer.from(secretKeyHex, "hex");
  if (key.length !== 32) {
    throw new Error("encryptDeploymentSecret requires 32-byte DEPLOYMENT_SECRET_KEY (hex)");
  }
  const iv = randomBytes3(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

// ../../infra/worker-service/src/provision-runtime.ts
import { eq as eq14 } from "drizzle-orm";

// ../../infra/worker-service/domain/provision-trace.ts
import { sql as sql3 } from "drizzle-orm";
var PROVISION_NOTIFY_CHANNEL = "stockix_provision_event";
var PROVISION_META_SCRUB_KEYS = /* @__PURE__ */ new Set([
  "oneTimeAdminPassword",
  "posDefaultCredentials",
  "pin",
  "fullCredentials",
  "plainPin"
]);
function scrubProvisionMeta(meta) {
  if (!meta) return null;
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!PROVISION_META_SCRUB_KEYS.has(key)) {
      out[key] = value;
    }
  }
  return out;
}
function createProvisionTracer(db, correlationId, getContext, log) {
  return {
    async event(phase, message, opts) {
      const level = opts?.level ?? "info";
      const rawMeta = opts?.meta ?? null;
      const meta = scrubProvisionMeta(rawMeta);
      const ctx = getContext();
      log(`[${phase}] ${message}`);
      const [row] = await db.insert(tenantProvisionEvents).values({
        correlationId,
        slug: ctx.slug,
        tenantId: ctx.tenantId ?? null,
        parentTenantId: ctx.parentTenantId ?? null,
        deploymentId: ctx.deploymentId ?? null,
        phase,
        level,
        message,
        meta
      }).returning({
        id: tenantProvisionEvents.id,
        createdAt: tenantProvisionEvents.createdAt
      });
      if (!row) return;
      const payload = {
        id: row.id,
        correlationId,
        slug: ctx.slug,
        tenantId: ctx.tenantId ?? null,
        parentTenantId: ctx.parentTenantId ?? null,
        deploymentId: ctx.deploymentId ?? null,
        phase,
        level,
        message,
        meta,
        createdAt: row.createdAt.toISOString()
      };
      await db.execute(
        sql3`SELECT pg_notify(${PROVISION_NOTIFY_CHANNEL}, ${JSON.stringify(payload)})`
      );
    }
  };
}

// ../../infra/worker-service/domain/provisioning/constants.ts
var STOCKIX_FINANCE_HEALTH_TIMEOUT_MS = 18e4;
var STOCKIX_FINANCE_HEALTH_POLL_MS = 2e3;
var COMPOSE_DOWN_TIMEOUT_MS = 2 * 60 * 1e3;
function resolveComposeStepTimeoutMs(args) {
  const subcommand = args[0];
  if (subcommand === "down") return COMPOSE_DOWN_TIMEOUT_MS;
  if (subcommand === "run") return apiConfig.dockerComposeRunTimeoutMs;
  if (subcommand === "up" || subcommand === "build" || subcommand === "pull") {
    return apiConfig.dockerComposeUpTimeoutMs;
  }
  return apiConfig.dockerComposeDefaultTimeoutMs;
}

// ../../infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-org-settings.ts
var MENA_DEFAULTS = {
  name: "",
  baseCurrency: "USD",
  timezone: "Asia/Beirut",
  location: "LB",
  fiscalYear: "january",
  language: "en",
  dateFormat: "MM/DD/yyyy"
};
function normalizeFiscalYearForFinanceBuild(value) {
  return value.trim().toLowerCase();
}
function normalizeLanguageForFinanceBuild(value) {
  const primary = value.trim().split(/[-_]/)[0]?.toLowerCase() ?? "en";
  return primary === "ar" ? "ar" : "en";
}
function normalizeDateFormatForFinanceBuild(value) {
  return value.trim().replace(/YYYY/g, "yyyy");
}
function financeApiBase(internalBaseUrl) {
  return internalBaseUrl.replace(/\/+$/, "");
}
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function readString2(v) {
  return typeof v === "string" && v.length > 0 ? v : void 0;
}
function parseSigninToken(body) {
  if (!isRecord(body)) return null;
  const accessToken = readString2(body.accessToken) ?? readString2(body.access_token) ?? readString2(body.token);
  const organizationId = readString2(body.organizationId) ?? readString2(body.organization_id);
  if (!accessToken || !organizationId) return null;
  return { accessToken, organizationId };
}
function parseCurrentOrg(body) {
  if (!isRecord(body)) return null;
  const builtAt = body.builtAt ?? body.built_at;
  const hasBuiltAt = builtAt !== null && builtAt !== void 0 && builtAt !== "";
  if (!hasBuiltAt) return null;
  const metaRaw = body.metadata;
  const meta = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw;
  if (!isRecord(meta)) return null;
  const baseCurrency = readString2(meta.baseCurrency) ?? readString2(meta.base_currency);
  const timezone = readString2(meta.timezone);
  const location = readString2(meta.location);
  const fiscalYear = readString2(meta.fiscalYear) ?? readString2(meta.fiscal_year);
  const language = readString2(meta.language);
  const dateFormat = readString2(meta.dateFormat) ?? readString2(meta.date_format);
  const name = readString2(meta.name) ?? "";
  if (!baseCurrency || !timezone || !location || !fiscalYear || !language) {
    return null;
  }
  return {
    name,
    baseCurrency,
    timezone,
    location,
    fiscalYear: normalizeFiscalYearForFinanceBuild(fiscalYear),
    language: normalizeLanguageForFinanceBuild(language),
    dateFormat: dateFormat ? normalizeDateFormatForFinanceBuild(dateFormat) : void 0
  };
}
async function fetchOrgSettingsFromMainInstance(params) {
  const base = financeApiBase(params.mainInternalBaseUrl);
  const headersBase = {
    "Content-Type": "application/json",
    "x-request-id": params.correlationId,
    "x-correlation-id": params.correlationId
  };
  let signinRes;
  try {
    signinRes = await fetch(`${base}/api/auth/signin`, {
      method: "POST",
      headers: headersBase,
      body: JSON.stringify({
        email: params.adminEmail,
        password: params.adminPassword
      }),
      signal: AbortSignal.timeout(1e4)
    });
  } catch {
    return null;
  }
  let signinJson;
  try {
    signinJson = await signinRes.json();
  } catch {
    return null;
  }
  if (!signinRes.ok) return null;
  const creds = parseSigninToken(signinJson);
  if (!creds) return null;
  let currentRes;
  try {
    currentRes = await fetch(`${base}/api/organization/current`, {
      method: "GET",
      headers: {
        ...headersBase,
        Authorization: `Bearer ${creds.accessToken}`,
        "organization-id": creds.organizationId
      },
      signal: AbortSignal.timeout(1e4)
    });
  } catch {
    return null;
  }
  let currentJson;
  try {
    currentJson = await currentRes.json();
  } catch {
    return null;
  }
  if (!currentRes.ok) return null;
  return parseCurrentOrg(currentJson);
}

// ../../infra/worker-service/domain/provisioning/tenant-env.ts
import { mkdir, rename, writeFile } from "fs/promises";
import { join as join4 } from "path";
function buildTenantSignupEnv() {
  return {
    SIGNUP_DISABLED: apiConfig.signupDisabled ? "true" : "false",
    SIGNUP_ALLOWED_DOMAINS: apiConfig.signupAllowedDomains,
    SIGNUP_ALLOWED_EMAILS: apiConfig.signupAllowedEmailsOverride
  };
}
function mailSecureEnvValue() {
  return env.MAIL_SECURE === "true" || env.MAIL_SECURE === "1" ? "true" : "";
}
function maybeEncryptEnvValue(value) {
  const trimmed = value.trim();
  if (!trimmed || isEncryptedDeploymentSecret(trimmed)) return trimmed;
  return encryptDeploymentSecret(trimmed, apiConfig.deploymentSecretKey);
}
function buildTenantEnvMap(params) {
  const signup = buildTenantSignupEnv();
  const mailPassword = env.MAIL_PASSWORD ?? "";
  const s3AccessKeyId = params.s3AccessKeyId;
  const s3SecretAccessKey = params.s3SecretAccessKey;
  return {
    MYSQL_VOLUME_NAME: params.mysqlVolumeName,
    STOCKIX_TENANT_APP_ROOT: params.stockixFinanceRoot,
    BASE_URL: params.baseUrl,
    DB_CLIENT: "mysql",
    DB_HOST: "mysql",
    DB_USER: "stockix_tenant",
    DB_PASSWORD: params.dbPassword,
    DB_ROOT_PASSWORD: params.dbRootPassword,
    DB_CHARSET: "utf8",
    SYSTEM_DB_CLIENT: "mysql",
    SYSTEM_DB_HOST: "mysql",
    SYSTEM_DB_USER: "stockix_tenant",
    SYSTEM_DB_PASSWORD: params.dbPassword,
    SYSTEM_DB_NAME: "stockix_system",
    SYSTEM_DB_CHARSET: "utf8",
    TENANT_DB_CLIENT: "mysql",
    TENANT_DB_HOST: "mysql",
    TENANT_DB_USER: "stockix_tenant",
    TENANT_DB_PASSWORD: params.dbPassword,
    TENANT_DB_NAME_PREFIX: "stockix_tenant_",
    TENANT_DB_NAME_PERFIX: "stockix_tenant_",
    TENANT_DB_CHARSET: "utf8",
    JWT_SECRET: params.jwtSecret,
    MONGODB_DATABASE_URL: env.MONGODB_DATABASE_URL ?? "mongodb://mongo/stockix",
    PUBLIC_PROXY_PORT: String(params.publicProxyPort),
    PUBLIC_PROXY_SSL_PORT: "443",
    ...signup,
    MAIL_HOST: env.MAIL_HOST ?? "",
    MAIL_USERNAME: env.MAIL_USERNAME ?? "",
    MAIL_PASSWORD: mailPassword ? maybeEncryptEnvValue(mailPassword) : "",
    MAIL_PORT: env.MAIL_PORT ?? "",
    MAIL_SECURE: mailSecureEnvValue(),
    MAIL_FROM_NAME: env.MAIL_FROM_NAME ?? "",
    MAIL_FROM_ADDRESS: env.MAIL_FROM_ADDRESS ?? "",
    REDIS_HOST: "redis",
    REDIS_PORT: "6379",
    REDIS_PASSWORD: "",
    REDIS_DB: "0",
    QUEUE_HOST: "redis",
    QUEUE_PORT: "6379",
    S3_REGION: params.s3Region,
    S3_ACCESS_KEY_ID: s3AccessKeyId ? maybeEncryptEnvValue(s3AccessKeyId) : "",
    S3_SECRET_ACCESS_KEY: s3SecretAccessKey ? maybeEncryptEnvValue(s3SecretAccessKey) : "",
    S3_ENDPOINT: params.s3Endpoint,
    S3_BUCKET: params.s3Bucket,
    S3_FORCE_PATH_STYLE: params.s3ForcePathStyle,
    AGENDASH_AUTH_USER: params.agendashUser,
    AGENDASH_AUTH_PASSWORD: params.agendashPassword,
    INTERNAL_API_SECRET: params.internalApiSecret ?? "",
    DEPLOYMENT_SECRET_KEY: apiConfig.deploymentSecretKey,
    BILLING_ENABLED: "false",
    REACT_APP_STOCKIX_API_URL: params.stockixApiUrl ?? "",
    REACT_APP_STOCKIX_TENANT_ID: params.stockixTenantId ?? "",
    REACT_APP_STOCKIX_APP_NAME: params.stockixAppName ?? "",
    REACT_APP_STOCKIX_LOGO_URL: params.stockixLogoUrl ?? "",
    REACT_APP_STOCKIX_PRIMARY_COLOR: params.stockixPrimaryColor ?? "",
    THROTTLE_GLOBAL_TTL: String(env.THROTTLE_GLOBAL_TTL),
    THROTTLE_GLOBAL_LIMIT: String(env.THROTTLE_GLOBAL_LIMIT),
    THROTTLE_AUTH_TTL: String(env.THROTTLE_AUTH_TTL),
    THROTTLE_AUTH_LIMIT: String(env.THROTTLE_AUTH_LIMIT)
  };
}
function serializeTenantEnvMap(map) {
  return `${Object.entries(map).map(([k, v]) => `${k}=${v}`).join("\n")}
`;
}
async function writeTenantEnvFileAtomic(tenantEnvDir, map) {
  const contents = serializeTenantEnvMap(map);
  await mkdir(tenantEnvDir, { recursive: true, mode: 448 });
  const target = join4(tenantEnvDir, ".env");
  const tmp = join4(tenantEnvDir, ".env.tmp");
  await writeFile(tmp, contents, { mode: 384 });
  await rename(tmp, target);
  return target;
}

// ../../packages/shared/src/finance-api.ts
function snakeCaseKeyToCamel(key) {
  if (!key.includes("_")) {
    return key;
  }
  const converted = key.replace(/([-_]\w)/g, (group) => group[1].toUpperCase());
  return converted.charAt(0).toLowerCase() + converted.slice(1);
}
function normalizeFinanceApiJson(value) {
  if (value === null || value === void 0) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFinanceApiJson(item));
  }
  if (typeof value !== "object") {
    return value;
  }
  const record = value;
  const out = {};
  for (const [key, val] of Object.entries(record)) {
    out[snakeCaseKeyToCamel(key)] = normalizeFinanceApiJson(val);
  }
  return out;
}
function parseFinanceApiJsonText(text2) {
  const trimmed = text2.trim();
  if (!trimmed) {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { raw: text2 };
  }
  const normalized = normalizeFinanceApiJson(parsed);
  if (typeof normalized === "object" && normalized !== null && !Array.isArray(normalized)) {
    return normalized;
  }
  return { value: normalized };
}

// ../../infra/worker-service/domain/provisioning/adapters/activate-finance-warehouses.ts
async function activateFinanceWarehouses(params) {
  const base = params.internalBaseUrl.replace(/\/+$/, "");
  const url = `${base}/api/internal/tenants/${params.financeTenantId}/activate-warehouses`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": params.internalApiSecret,
      ...params.correlationId ? { "x-request-id": params.correlationId } : {}
    },
    signal: AbortSignal.timeout(12e4)
  });
  const text2 = await res.text();
  const body = parseFinanceApiJsonText(text2);
  if (!res.ok) {
    const detail = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : text2.slice(0, 300);
    throw new Error(`activate_warehouses_failed:${res.status}:${detail}`);
  }
  const primaryWarehouseId = Number(
    body.primaryWarehouseId ?? body.primary_warehouse_id
  );
  if (!Number.isFinite(primaryWarehouseId) || primaryWarehouseId <= 0) {
    params.log?.(
      `[provision] activate-warehouses unexpected body (HTTP ${res.status}): ${text2.slice(0, 400)}`
    );
    throw new Error("activate_warehouses_failed:missing_primaryWarehouseId");
  }
  params.log?.(
    `[provision] Warehouses activated tenant=${params.financeTenantId} warehouse=${primaryWarehouseId} already=${Boolean(body.alreadyActivated)}`
  );
  return {
    primaryWarehouseId,
    alreadyActivated: Boolean(body.alreadyActivated)
  };
}

// ../../infra/worker-service/domain/provisioning/adapters/copy-coa-across-stacks.ts
function normalizeFinanceBase(url) {
  return url.replace(/\/+$/, "");
}
async function resolveParentFinanceTenantId(params) {
  const base = normalizeFinanceBase(params.parentInternalUrl);
  const url = `${base}/api/internal/resolve-tenant?email=${encodeURIComponent(params.adminEmail)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-internal-secret": params.internalSecret,
      ...params.correlationId ? { "x-request-id": params.correlationId } : {}
    },
    signal: AbortSignal.timeout(15e3)
  });
  if (!res.ok) {
    return null;
  }
  const body = parseFinanceApiJsonText(await res.text());
  const tenantId = Number(body.tenantId ?? body.tenant_id);
  return Number.isFinite(tenantId) && tenantId > 0 ? tenantId : null;
}
async function copyCoaAcrossStacks(params) {
  const parentBase = normalizeFinanceBase(params.parentInternalUrl);
  const childBase = normalizeFinanceBase(params.childInternalUrl);
  let parentTenantId = params.parentTenantId;
  if ((!parentTenantId || parentTenantId <= 0) && params.adminEmail) {
    const resolved = await resolveParentFinanceTenantId({
      parentInternalUrl: parentBase,
      adminEmail: params.adminEmail,
      internalSecret: params.internalSecret,
      correlationId: params.correlationId
    });
    if (resolved) {
      parentTenantId = resolved;
      params.log?.(`[provision] Resolved parent financeTenantId=${parentTenantId}`);
    }
  }
  if (!parentTenantId || parentTenantId <= 0) {
    throw new Error("copy_coa_failed:missing_parent_tenant_id");
  }
  if (!params.childTenantId || params.childTenantId <= 0) {
    throw new Error("copy_coa_failed:missing_child_tenant_id");
  }
  const exportUrl = `${parentBase}/api/internal/tenants/${parentTenantId}/export-chart-of-accounts`;
  const exportRes = await fetch(exportUrl, {
    method: "GET",
    headers: {
      "x-internal-secret": params.internalSecret,
      ...params.correlationId ? { "x-request-id": params.correlationId } : {}
    },
    signal: AbortSignal.timeout(6e4)
  });
  const exportText = await exportRes.text();
  if (!exportRes.ok) {
    throw new Error(
      `copy_coa_export_failed:${exportRes.status}:${exportText.slice(0, 200)}`
    );
  }
  const exported = parseFinanceApiJsonText(exportText);
  const accounts = Array.isArray(exported.accounts) ? exported.accounts : [];
  const taxRates = Array.isArray(exported.taxRates) ? exported.taxRates : Array.isArray(exported.tax_rates) ? exported.tax_rates : [];
  const settings = Array.isArray(exported.settings) ? exported.settings : [];
  params.log?.(
    `[provision] Exported COA from parent tenant=${parentTenantId} accounts=${accounts.length} taxRates=${taxRates.length}`
  );
  const importUrl = `${childBase}/api/internal/tenants/${params.childTenantId}/import-chart-of-accounts`;
  const importRes = await fetch(importUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": params.internalSecret,
      ...params.correlationId ? { "x-request-id": params.correlationId } : {}
    },
    body: JSON.stringify({ accounts, taxRates, settings }),
    signal: AbortSignal.timeout(12e4)
  });
  const importText = await importRes.text();
  const imported = parseFinanceApiJsonText(importText);
  if (!importRes.ok) {
    throw new Error(
      `copy_coa_import_failed:${importRes.status}:${importText.slice(0, 200)}`
    );
  }
  const accountsCopied = Number(imported.accountsCopied ?? imported.accounts_copied ?? 0);
  const taxRatesCopied = Number(imported.taxRatesCopied ?? imported.tax_rates_copied ?? 0);
  const settingsCopied = Number(imported.settingsCopied ?? imported.settings_copied ?? 0);
  params.log?.(
    `[provision] Cross-stack COA copy ok child=${params.childTenantId} accounts=${accountsCopied} tax=${taxRatesCopied} settings=${settingsCopied}`
  );
  return { accountsCopied, taxRatesCopied, settingsCopied };
}
function isSeparateStackSubOrg(params) {
  const parentSlug = params.parentTenantSlug?.trim();
  const mainBase = params.mainTenantInternalBaseUrl?.trim();
  const childBase = params.childInternalUrl?.trim();
  if (!parentSlug || !mainBase || !childBase) {
    return false;
  }
  return normalizeFinanceBase(mainBase) !== normalizeFinanceBase(childBase);
}

// ../../infra/worker-service/domain/provisioning/adapters/seed-finance-pos-defaults.ts
function readOptionalPositiveId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : void 0;
}
async function seedFinancePosDefaults(params) {
  const base = params.internalBaseUrl.replace(/\/+$/, "");
  const url = `${base}/api/internal/tenants/${params.financeTenantId}/seed-pos-defaults`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": params.internalApiSecret,
      ...params.correlationId ? { "x-request-id": params.correlationId } : {}
    },
    signal: AbortSignal.timeout(12e4)
  });
  const text2 = await res.text();
  const body = parseFinanceApiJsonText(text2);
  if (!res.ok) {
    const detail = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : text2.slice(0, 300);
    throw new Error(`seed_pos_defaults_failed:${res.status}:${detail}`);
  }
  const walkInCustomerId = Number(body.walkInCustomerId);
  const cashAccountId = Number(body.cashAccountId);
  const cardAccountId = Number(body.cardAccountId);
  if (!Number.isFinite(walkInCustomerId) || walkInCustomerId <= 0 || !Number.isFinite(cashAccountId) || cashAccountId <= 0 || !Number.isFinite(cardAccountId) || cardAccountId <= 0) {
    throw new Error("seed_pos_defaults_failed:missing_ids");
  }
  const serviceChargeItemId = readOptionalPositiveId(body.serviceChargeItemId);
  const discountItemId = readOptionalPositiveId(body.discountItemId);
  const bridgeNote = serviceChargeItemId || discountItemId ? ` serviceCharge=${serviceChargeItemId ?? "n/a"} discount=${discountItemId ?? "n/a"}` : "";
  params.log?.(
    `[provision] POS defaults seeded walkIn=${walkInCustomerId} cash=${cashAccountId} card=${cardAccountId}${bridgeNote}`
  );
  return {
    walkInCustomerId,
    cashAccountId,
    cardAccountId,
    serviceChargeItemId,
    discountItemId
  };
}

// ../../infra/worker-service/domain/provisioning/build-finance-internal-url.ts
function buildFinanceInternalUrlForPos(params) {
  const template = process.env.POS_FINANCE_INTERNAL_URL_TEMPLATE?.trim();
  if (template) {
    return template.replace(/\{slug\}/g, params.slug).replace(/\{port\}/g, String(params.internalPort)).replace(/\{host\}/g, financeInternalHost());
  }
  const useTraefik = process.env.POS_FINANCE_USE_TRAEFIK_URL === "1" || process.env.POS_FINANCE_USE_TRAEFIK_URL === "true";
  if (useTraefik) {
    const rootDomain = apiConfig.rootDomain || "example.com";
    const scheme = apiConfig.publicBaseUrlScheme || "https";
    return `${scheme}://${params.slug}.${rootDomain}`;
  }
  const host = financeInternalHost();
  return `http://${host}:${params.internalPort}`;
}
function financeInternalHost() {
  const fromEnv = process.env.POS_FINANCE_INTERNAL_HOST?.trim();
  if (fromEnv) return fromEnv;
  return "host.docker.internal";
}

// ../../infra/worker-service/domain/provisioning/adapters/wire-pos-bigcapital-integration.ts
function apiKeyOrThrow() {
  const key = posConfig.platformApiKey.trim();
  if (key.length < 10) {
    throw new Error(
      "POS_PLATFORM_API_KEY is required for POS integration wiring (min 10 characters)"
    );
  }
  return key;
}
function posApiBase(input) {
  const port = input.posHostPort;
  const fromEnv = input.posBaseUrl ?? posConfig.platformBaseUrl;
  if (fromEnv && !fromEnv.includes("localhost:8010")) {
    return fromEnv.replace(/\/+$/, "");
  }
  return `http://127.0.0.1:${port}`;
}
async function wirePosBigcapitalIntegration(input) {
  const apiKey = apiKeyOrThrow();
  const base = posApiBase(input);
  const internalBaseUrl = buildFinanceInternalUrlForPos({
    slug: input.slug,
    internalPort: input.internalPort,
    workerInternalUrl: input.workerInternalUrl
  });
  const internalSecret = apiConfig.internalApiSecret?.trim();
  if (!internalSecret) {
    throw new Error("INTERNAL_API_SECRET is required to wire POS Bigcapital integration");
  }
  const url = `${base}/api/platform/v1/organizations/${input.posOrganizationId}/integration/bigcapital`;
  input.log(
    `[provision][pos] wiring Bigcapital integration orgId=${input.posOrganizationId} financeUrl=${internalBaseUrl}`
  );
  const body = {
    enabled: true,
    financeTenantId: input.financeTenantId,
    internalBaseUrl,
    internalSecret,
    defaultWalkInCustomerId: input.walkInCustomerId,
    defaultCashDepositAccountId: input.cashAccountId,
    defaultCardDepositAccountId: input.cardAccountId
  };
  if (input.serviceChargeItemId && input.serviceChargeItemId > 0) {
    body.serviceChargeItemId = input.serviceChargeItemId;
  }
  if (input.discountItemId && input.discountItemId > 0) {
    body.discountItemId = input.discountItemId;
  }
  if (input.defaultWarehouseId && input.defaultWarehouseId > 0) {
    body.defaultWarehouseId = input.defaultWarehouseId;
  }
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      "X-Forwarded-Proto": "https"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6e4)
  });
  const text2 = await res.text();
  if (!res.ok) {
    throw new Error(
      `wire_pos_integration_failed:${res.status}:${text2.slice(0, 500)}`
    );
  }
  try {
    const body2 = JSON.parse(text2);
    if (body2?.data?.bigcapitalIntegrationEnabled !== true) {
      throw new Error("wire_pos_integration_verify:integration_not_enabled");
    }
  } catch (parseErr) {
    if (parseErr instanceof Error && parseErr.message.startsWith("wire_pos")) {
      throw parseErr;
    }
    throw new Error(`wire_pos_integration_verify:invalid_response:${text2.slice(0, 120)}`);
  }
  input.log("[provision][pos] Bigcapital integration wired successfully");
  return { wired: true, internalBaseUrl };
}

// ../../infra/worker-service/domain/provisioning/adapters/complete-finance-setup-wizard.ts
async function completeFinanceSetupWizard(params) {
  const secret = apiConfig.internalApiSecret?.trim();
  if (!secret) {
    return { ok: false, error: "INTERNAL_API_SECRET is required for setup complete" };
  }
  const url = `${params.internalBaseUrl.replace(/\/+$/, "")}/api/internal/organization/setup/complete`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret
      },
      body: JSON.stringify({ tenant_id: params.financeTenantId }),
      signal: AbortSignal.timeout(3e4)
    });
    const text2 = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `setup_complete_failed:${res.status}:${text2.slice(0, 300)}`
      };
    }
    params.log(
      `[provision] setup wizard marked complete financeTenantId=${params.financeTenantId}`
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `setup_complete_failed:${msg}` };
  }
}

// ../../infra/worker-service/domain/provisioning/partial-provision.ts
import { eq as eq10 } from "drizzle-orm";
async function markTenantPartial(db, params) {
  await db.update(tenants).set({ status: "partial" }).where(eq10(tenants.id, params.tenantId));
  await db.update(tenantDeployments).set({
    status: "active",
    lastError: params.lastError,
    partialFailureKind: params.kind,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq10(tenantDeployments.tenantId, params.tenantId));
}
async function clearTenantPartialState(db, tenantId, tenantStatus = "active") {
  await db.update(tenants).set({ status: tenantStatus }).where(eq10(tenants.id, tenantId));
  await db.update(tenantDeployments).set({
    lastError: null,
    partialFailureKind: null,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq10(tenantDeployments.tenantId, tenantId));
}

// ../../infra/worker-service/domain/provisioning/tenant-docker-workflow.ts
async function composeDownBestEffort(runner, ctx) {
  const result = await runner.run(
    ctx.composeFile,
    ctx.project,
    ctx.envPath,
    ctx.composeEnv,
    ["down", "--remove-orphans", "-v", "--timeout", "30"],
    { timeoutMs: 2 * 60 * 1e3 }
  ).then(() => true).catch(() => false);
  return result;
}

// ../../infra/worker-service/src/chatwoot-provision.ts
import { randomBytes as randomBytes4 } from "crypto";
import { eq as eq11 } from "drizzle-orm";
function generateSecurePassword() {
  return randomBytes4(18).toString("base64url");
}
async function provisionChatwootAccount(opts) {
  const { db, tenantId, tenantName, adminEmail, chatwootBaseUrl, chatwootApiKey, log } = opts;
  if (!chatwootBaseUrl || !chatwootApiKey) {
    log("[chatwoot] CHATWOOT_BASE_URL or CHATWOOT_API_ACCESS_TOKEN not set; skipping");
    return { accountId: null };
  }
  const password = generateSecurePassword();
  const base = chatwootBaseUrl.replace(/\/$/, "");
  try {
    const accountRes = await fetch(`${base}/platform/api/v1/accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_access_token: chatwootApiKey
      },
      body: JSON.stringify({
        name: tenantName
      })
    });
    let accountId = null;
    if (accountRes.ok) {
      const accountJson = await accountRes.json();
      accountId = String(accountJson.id ?? accountJson.payload?.account?.id ?? "");
    } else {
      log(
        `[chatwoot] platform account create failed HTTP ${accountRes.status}; trying sign_up fallback`
      );
      const signUpRes = await fetch(`${base}/auth/sign_up`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_access_token: chatwootApiKey
        },
        body: JSON.stringify({
          account_name: tenantName,
          email: adminEmail,
          password,
          confirm_password: password
        })
      });
      if (!signUpRes.ok) {
        const text2 = await signUpRes.text();
        log(`[chatwoot] sign_up failed: HTTP ${signUpRes.status} ${text2.slice(0, 200)}`);
        return { accountId: null };
      }
      const signUpJson = await signUpRes.json();
      accountId = signUpJson.data?.account_id ? String(signUpJson.data.account_id) : null;
    }
    if (accountId) {
      await db.update(tenants).set({ chatwootAccountId: accountId }).where(eq11(tenants.id, tenantId));
      log(`[chatwoot] account ${accountId} linked to tenant ${tenantId}`);
    }
    return { accountId };
  } catch (error) {
    log(
      `[chatwoot] provision error: ${error instanceof Error ? error.message : String(error)}`
    );
    return { accountId: null };
  }
}

// ../../infra/worker-service/src/module-stacks.ts
import { isAbsolute, join as join6 } from "path";
import { execa as execa2 } from "execa";

// ../../packages/config/src/public.ts
function readPublicEnv(name, fallback = "") {
  const value = process.env[name];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
var publicConfig = {
  stockixApiUrl: readPublicEnv("NEXT_PUBLIC_STOCKIX_API_URL", "http://localhost:4000"),
  stockixRootDomain: readPublicEnv("NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN", "localhost"),
  stockixPublicScheme: readPublicEnv("NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME", "http"),
  stockixLocalTenantHost: readPublicEnv("NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST", "127.0.0.1"),
  nodeEnv: readPublicEnv("NODE_ENV", "development"),
  publicUrl: readPublicEnv("PUBLIC_URL", ""),
  monorepoVersion: readPublicEnv("MONOREPO_VERSION", "")
};

// ../../infra/worker-service/src/module-stacks.ts
import { eq as eq12 } from "drizzle-orm";

// ../../packages/shared/src/pos-entitlements-from-modules.ts
var DEFAULT_PLAN_LIMITS = {
  maxUsers: 25,
  maxLocations: 5,
  maxOrdersPerMonth: 1e4
};
function posModuleEntitlementsFromStockixModules(modules) {
  const normalized = (modules ?? []).map((m) => String(m).trim().toLowerCase()).filter(Boolean);
  const hasAccounting = normalized.includes("accounting");
  const hasPos = normalized.includes("pos");
  if (hasPos && !hasAccounting) {
    return { inventory: true, accounting: false };
  }
  return { inventory: true, accounting: true };
}
function buildPosEntitlementsForProvision(input) {
  return {
    maxUsers: input.maxUsers ?? DEFAULT_PLAN_LIMITS.maxUsers,
    maxLocations: input.maxLocations ?? DEFAULT_PLAN_LIMITS.maxLocations,
    maxOrdersPerMonth: input.maxOrdersPerMonth ?? DEFAULT_PLAN_LIMITS.maxOrdersPerMonth,
    modules: posModuleEntitlementsFromStockixModules(input.modules)
  };
}

// ../../infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.ts
var BOOTSTRAP_POLL_TIMEOUT_MS = Number(process.env.BOOTSTRAP_POLL_TIMEOUT_MS ?? 6e4);
var BOOTSTRAP_CREDENTIALS_WAIT_MS = Number(
  process.env.BOOTSTRAP_CREDENTIALS_WAIT_MS ?? 12e4
);
var BOOTSTRAP_POLL_INTERVAL_MS = Number(process.env.BOOTSTRAP_POLL_INTERVAL_MS ?? 1500);
var POS_HEALTH_TIMEOUT_MS = 9e4;
var POS_HEALTH_INTERVAL_MS = 2e3;
var PLATFORM_AUTH_TIMEOUT_MS = 3e4;
var PLATFORM_AUTH_INTERVAL_MS = 1e3;
function posApiBase2(input) {
  const port = input.posHostPort ?? Number(process.env.POS_HOST_PORT ?? 8010);
  const fromEnv = input.posBaseUrl ?? posConfig.platformBaseUrl;
  if (fromEnv && !fromEnv.includes("localhost:8010")) {
    return fromEnv.replace(/\/+$/, "");
  }
  return `http://127.0.0.1:${port}`;
}
function apiKeyOrThrow2() {
  const key = posConfig.platformApiKey.trim();
  if (key.length < 10) {
    throw new Error(
      "POS_PLATFORM_API_KEY is required for POS org bootstrap (min 10 characters)"
    );
  }
  return key;
}
function parseJson(text2) {
  if (!text2) return {};
  try {
    return JSON.parse(text2);
  } catch {
    return { raw: text2 };
  }
}
function isRecord2(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function readOrgId(body) {
  if (!isRecord2(body)) return null;
  const data = body.data;
  if (!isRecord2(data)) return null;
  const id = data._id ?? data.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
function isPlaintextCredentialPin(pin) {
  const p = pin.trim();
  if (p.length < 4) return false;
  if (p.includes("\u2022") || p.includes("*")) return false;
  if (/^[*•]+$/.test(p)) return false;
  return /^\d{4,6}$/.test(p);
}
function normalizeCredentials(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!isRecord2(row)) continue;
    const role = typeof row.role === "string" ? row.role : "";
    const username = typeof row.username === "string" ? row.username : typeof row.name === "string" ? row.name : role;
    const pin = typeof row.pin === "string" ? row.pin : "";
    if (!role || !pin || !isPlaintextCredentialPin(pin)) continue;
    out.push({ role, username, pin });
  }
  return out;
}
function readFullCredentialsFromJson(body) {
  if (!isRecord2(body)) return [];
  if (Array.isArray(body.fullCredentials)) {
    const fromTop = normalizeCredentials(body.fullCredentials);
    if (fromTop.length > 0) return fromTop;
  }
  const data = body.data;
  if (isRecord2(data) && Array.isArray(data.fullCredentials)) {
    return normalizeCredentials(data.fullCredentials);
  }
  return [];
}
function readDefaultCredentialsFromOrgJson(body) {
  if (!isRecord2(body)) return [];
  const data = body.data;
  if (isRecord2(data) && Array.isArray(data.defaultCredentials)) {
    return normalizeCredentials(data.defaultCredentials);
  }
  return [];
}
async function fetchCredentialsFromOrg(base, orgId, apiKey) {
  const orgRes = await platformFetch(base, `/api/platform/v1/organizations/${orgId}`, {
    method: "GET",
    apiKey
  });
  if (!orgRes.ok) return [];
  return readDefaultCredentialsFromOrgJson(orgRes.json);
}
function toPosDefaultCredentials(creds) {
  const admin = creds.find((c) => c.role === "admin");
  return {
    adminPin: admin?.pin ?? "",
    allRoles: creds
  };
}
async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}
async function waitForPosBackend(base, log) {
  const started = Date.now();
  const paths = ["/health", "/ready"];
  while (Date.now() - started < POS_HEALTH_TIMEOUT_MS) {
    for (const path2 of paths) {
      try {
        const res = await fetch(`${base}${path2}`, {
          signal: AbortSignal.timeout(4e3)
        });
        if (res.ok) {
          log(`[provision][pos] backend ready (${path2})`);
          return;
        }
      } catch {
      }
    }
    await sleep(POS_HEALTH_INTERVAL_MS);
  }
  throw new Error(`POS backend not ready within ${POS_HEALTH_TIMEOUT_MS}ms (${base})`);
}
async function waitForPlatformApiAuth(base, apiKey, log) {
  const started = Date.now();
  while (Date.now() - started < PLATFORM_AUTH_TIMEOUT_MS) {
    const probe = await platformFetch(base, "/api/platform/v1/organizations/health-summary", {
      method: "GET",
      apiKey
    });
    if (probe.ok) {
      log("[provision][pos] platform API key accepted");
      return;
    }
    if (probe.status !== 401) {
      throw new Error(
        `POS platform auth probe failed (${probe.status}): ${probe.text.slice(0, 200)}`
      );
    }
    await sleep(PLATFORM_AUTH_INTERVAL_MS);
  }
  throw new Error(
    `POS platform API key not accepted within ${PLATFORM_AUTH_TIMEOUT_MS}ms (${base})`
  );
}
async function platformFetch(base, path2, init) {
  const res = await fetch(`${base}${path2}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": init.apiKey,
      // Per-tenant stack is reached over loopback HTTP; Traefik terminates TLS in production.
      "X-Forwarded-Proto": "https",
      ...init.headers ?? {}
    },
    signal: AbortSignal.timeout(3e4)
  });
  const text2 = await res.text();
  return { ok: res.ok, status: res.status, json: parseJson(text2), text: text2 };
}
async function bootstrapPosOrganization(input) {
  const apiKey = apiKeyOrThrow2();
  const base = posApiBase2(input);
  const log = input.log;
  await waitForPosBackend(base, log);
  await waitForPlatformApiAuth(base, apiKey, log);
  const licenseStartsAt = (/* @__PURE__ */ new Date()).toISOString();
  const licenseEndsAt = new Date(
    input.licenseExpiresAt != null ? new Date(input.licenseExpiresAt).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1e3
  ).toISOString();
  const idempotencyKey = `stockix-provision-${input.tenantId}`;
  const entitlements = buildPosEntitlementsForProvision({
    modules: input.tenantModules,
    maxUsers: input.maxUsers,
    maxLocations: input.maxLocations,
    maxOrdersPerMonth: input.maxOrdersPerMonth
  });
  log(`[provision][pos] creating organization slug=${input.slug}`);
  const createRes = await platformFetch(base, "/api/platform/v1/organizations", {
    method: "POST",
    apiKey,
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      name: input.tenantName,
      slug: input.slug,
      stockixTenantId: input.tenantId,
      ownerEmail: input.adminEmail,
      timezone: "UTC",
      licenseStartsAt,
      licenseEndsAt,
      entitlements
    })
  });
  if (!createRes.ok) {
    throw new Error(
      `POS org create failed (${createRes.status}): ${createRes.text.slice(0, 500)}`
    );
  }
  const orgId = readOrgId(createRes.json);
  if (!orgId) {
    throw new Error("POS org create response missing organization id");
  }
  const bootstrapMode = isRecord2(createRes.json) && typeof createRes.json.bootstrapMode === "string" ? createRes.json.bootstrapMode : void 0;
  let credentials = normalizeCredentials(
    isRecord2(createRes.json) && isRecord2(createRes.json.data) ? createRes.json.data.defaultCredentials : null
  );
  if (credentials.length === 0) {
    credentials = readFullCredentialsFromJson(createRes.json);
  }
  if (bootstrapMode !== "sync_fallback") {
    const pollStarted = Date.now();
    let bootstrapReady = false;
    let readySince = null;
    log(`[provision][pos] waiting for org bootstrap orgId=${orgId}`);
    while (Date.now() - pollStarted < BOOTSTRAP_POLL_TIMEOUT_MS) {
      const statusRes = await platformFetch(
        base,
        `/api/platform/v1/organizations/${orgId}/provisioning-status`,
        { method: "GET", apiKey }
      );
      if (!statusRes.ok) {
        throw new Error(
          `POS provisioning-status failed (${statusRes.status}): ${statusRes.text.slice(0, 300)}`
        );
      }
      const data = isRecord2(statusRes.json) && isRecord2(statusRes.json.data) ? statusRes.json.data : null;
      const readyForPinLogin = data?.readyForPinLogin === true;
      if (readyForPinLogin) {
        if (readySince == null) readySince = Date.now();
        const fromStatus = readFullCredentialsFromJson(statusRes.json);
        if (fromStatus.length > 0) {
          credentials = fromStatus;
          bootstrapReady = true;
          log(`[provision][pos] org bootstrap ready orgId=${orgId}`);
          break;
        }
        const fromOrg = await fetchCredentialsFromOrg(base, orgId, apiKey);
        if (fromOrg.length > 0) {
          credentials = fromOrg;
          bootstrapReady = true;
          log(
            `[provision][pos] org bootstrap ready (legacy plaintext defaultCredentials) orgId=${orgId}`
          );
          break;
        }
        if (readySince != null && Date.now() - readySince >= BOOTSTRAP_CREDENTIALS_WAIT_MS) {
          break;
        }
      } else {
        readySince = null;
      }
      await sleep(BOOTSTRAP_POLL_INTERVAL_MS);
    }
    if (!bootstrapReady) {
      throw new Error(
        `POS org bootstrap timed out after ${BOOTSTRAP_POLL_TIMEOUT_MS}ms (orgId=${orgId})`
      );
    }
  }
  if (credentials.length === 0) {
    throw new Error(
      `POS org bootstrap finished but fullCredentials missing for orgId=${orgId}`
    );
  }
  const consumeRes = await platformFetch(
    base,
    `/api/platform/v1/organizations/${orgId}/provisioning-credentials/consume`,
    { method: "POST", apiKey }
  );
  if (consumeRes.status !== 204 && consumeRes.status !== 200) {
    log(
      `[provision][pos] warning: provisioning-credentials/consume returned ${consumeRes.status} orgId=${orgId}`
    );
  }
  return {
    posOrganizationId: orgId,
    posDefaultCredentials: toPosDefaultCredentials(credentials),
    bootstrapMode
  };
}

// ../../infra/worker-service/domain/traefik-config.ts
import { mkdir as mkdir2, unlink, writeFile as writeFile2 } from "fs/promises";
import { join as join5 } from "path";
function traefikDir() {
  return apiConfig.traefikDynamicDir;
}
function tenantUpstreamHost() {
  return apiConfig.traefikTenantUpstreamHost;
}
async function writeTenantTraefikConfig(slug, port, domain) {
  const dir = traefikDir();
  await mkdir2(dir, { recursive: true });
  const config = `http:
  routers:
    tenant-${slug}:
      rule: "Host(\`${slug}.${domain}\`)"
      entryPoints:
        - websecure
      tls:
        certResolver: cloudflare
      service: tenant-${slug}
  services:
    tenant-${slug}:
      loadBalancer:
        servers:
          - url: "http://${tenantUpstreamHost()}:${port}"
`;
  await writeFile2(join5(dir, `tenant-${slug}.yml`), config, "utf8");
}
async function removeTenantTraefikConfig(slug) {
  try {
    await unlink(join5(traefikDir(), `tenant-${slug}.yml`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("no such file")) {
      throw error;
    }
  }
}
async function writePosTraefikConfig(slug, backendPort, frontendPort, domain) {
  const dir = traefikDir();
  await mkdir2(dir, { recursive: true });
  const host = tenantUpstreamHost();
  const config = `http:
  routers:
    tenant-pos-${slug}:
      rule: "Host(\`${slug}-pos.${domain}\`)"
      entryPoints:
        - websecure
      tls:
        certResolver: cloudflare
      service: tenant-pos-${slug}-frontend
    tenant-pos-api-${slug}:
      rule: "Host(\`${slug}-pos-api.${domain}\`)"
      entryPoints:
        - websecure
      tls:
        certResolver: cloudflare
      service: tenant-pos-${slug}-backend
  services:
    tenant-pos-${slug}-frontend:
      loadBalancer:
        servers:
          - url: "http://${host}:${frontendPort}"
    tenant-pos-${slug}-backend:
      loadBalancer:
        servers:
          - url: "http://${host}:${backendPort}"
`;
  await writeFile2(join5(dir, `tenant-pos-${slug}.yml`), config, "utf8");
}
async function removePosTraefikConfig(slug) {
  try {
    await unlink(join5(traefikDir(), `tenant-pos-${slug}.yml`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("no such file")) {
      throw error;
    }
  }
}

// ../../infra/worker-service/src/module-stacks.ts
function repoRoot() {
  return apiConfig.repoRoot ?? process.cwd();
}
async function dockerImageExists(tag) {
  try {
    await execa2("docker", ["image", "inspect", tag], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
var DEFAULT_MODULES = ["accounting"];
function resolveTenantModules(inputModules) {
  if (!inputModules?.length) {
    return [...DEFAULT_MODULES];
  }
  const filtered = inputModules.filter(
    (m) => typeof m === "string" && m.trim().length > 0
  );
  return filtered.length > 0 ? filtered : [...DEFAULT_MODULES];
}
function isModuleGatingEnabled() {
  return moduleGatingConfig.enabled;
}
function shouldProvisionFinanceStack(modules) {
  return resolveTenantModules(modules).includes("accounting");
}
function hasAccountingAndPos(modules) {
  return modules.includes("accounting") && modules.includes("pos");
}
function isPosOnlyModules(modules) {
  const resolved = resolveTenantModules(modules);
  return resolved.includes("pos") && !resolved.includes("accounting");
}
function defaultPosBackendPort() {
  const raw = process.env.POS_HOST_PORT ?? "8010";
  const port = Number(raw);
  return Number.isFinite(port) && port > 0 ? port : 8010;
}
function defaultPosFrontendPort() {
  const raw = process.env.POS_FRONTEND_HOST_PORT ?? "3001";
  const port = Number(raw);
  return Number.isFinite(port) && port > 0 ? port : 3001;
}
function buildPosPublicUrls(slug, ports) {
  const rootDomain = apiConfig.rootDomain || "example.com";
  const scheme = (apiConfig.publicBaseUrlScheme || "https").replace(/:+$/, "");
  if (rootDomain === "localhost") {
    const host = publicConfig.stockixLocalTenantHost || "127.0.0.1";
    return {
      posUrl: `${scheme}://${host}:${ports.frontendPort}`,
      posApiUrl: `${scheme}://${host}:${ports.backendPort}`
    };
  }
  return {
    posUrl: `${scheme}://${slug}-pos.${rootDomain}`,
    posApiUrl: `${scheme}://${slug}-pos-api.${rootDomain}`
  };
}
async function resolvePosPorts(db, log) {
  if (!db) {
    return {
      backendPort: defaultPosBackendPort(),
      frontendPort: defaultPosFrontendPort()
    };
  }
  const maxPort = apiConfig.maxTenantPort;
  const backendPort = await allocateTenantPort(db, maxPort);
  const frontendPort = await allocateTenantPort(db, maxPort);
  log(`[provision][pos] allocated ports backend=${backendPort} frontend=${frontendPort}`);
  return { backendPort, frontendPort };
}
async function provisionPosStack(opts) {
  const composeFile = join6(repoRoot(), "infra", "pos-tenant-stack", "docker-compose.yml");
  const project = `stockix-pos-${opts.slug}`;
  const posAppRootRaw = process.env.POS_APP_ROOT ?? join6("services", "posnew");
  const posAppRoot = isAbsolute(posAppRootRaw) ? posAppRootRaw : join6(repoRoot(), posAppRootRaw);
  const platformApiKey = posConfig.platformApiKey.trim();
  const rootDomain = apiConfig.rootDomain || "example.com";
  const { backendPort, frontendPort } = await resolvePosPorts(opts.db, opts.log);
  const { posUrl, posApiUrl } = buildPosPublicUrls(opts.slug, { backendPort, frontendPort });
  const financeInternalBaseUrl = opts.financeInternalPort && opts.financeInternalPort > 0 ? buildFinanceInternalUrlForPos({
    slug: opts.slug,
    internalPort: opts.financeInternalPort
  }) : "";
  opts.log(`[provision][pos] compose up project=${project}`);
  const stockixRepoRoot = repoRoot();
  const composeEnv = {
    ...process.env,
    COMPOSE_PROJECT_NAME: project,
    STOCKIX_REPO_ROOT: stockixRepoRoot,
    POS_APP_ROOT: posAppRoot,
    POS_HOST_PORT: String(backendPort),
    POS_FRONTEND_HOST_PORT: String(frontendPort),
    TENANT_ID: opts.tenantId,
    AUTH_TOKEN_SECRET: apiConfig.authTokenSecret ?? "",
    POS_PLATFORM_API_KEY: platformApiKey,
    POS_BACKEND_URL: posApiUrl,
    POS_FRONTEND_URL: posUrl,
    ROOT_DOMAIN: rootDomain,
    ...financeInternalBaseUrl ? { FINANCE_INTERNAL_BASE_URL: financeInternalBaseUrl } : {}
  };
  if (!await dockerImageExists("stockix-pos-backend:local")) {
    throw new Error(
      "stockix-pos-backend:local not found \u2014 run pnpm pos:images:build before POS provision"
    );
  }
  const upServices = [
    "pos-mongo",
    "pos-mongo-init",
    "pos-redis",
    "pos-backend",
    "pos-platform-worker",
    "pos-bigcapital-worker"
  ];
  if (await dockerImageExists("stockix-pos-frontend:local")) {
    upServices.push("pos-frontend");
  } else {
    opts.log(
      "[provision][pos] stockix-pos-frontend:local not found \u2014 skipping frontend container (pnpm pos:images:build)"
    );
  }
  try {
    const composeRun = await execa2(
      "docker",
      ["compose", "-f", composeFile, "-p", project, "up", "-d", ...upServices],
      { env: composeEnv, stdio: "pipe", reject: false }
    );
    if (composeRun.stdout) {
      for (const line of composeRun.stdout.split("\n").slice(-20)) {
        if (line.trim()) opts.log(`[provision][pos][compose] ${line}`);
      }
    }
    if (composeRun.exitCode !== 0) {
      const stderrTail = (composeRun.stderr ?? "").slice(-2048);
      opts.log(`[provision][pos][compose] stderr (tail):
${stderrTail}`);
      throw new Error(
        `docker compose exit ${composeRun.exitCode}: ${stderrTail.slice(0, 400) || "see worker logs"}`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("docker compose exit")) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`POS compose failed: ${msg}`);
  }
  const bootstrap = await bootstrapPosOrganization({
    slug: opts.slug,
    tenantName: opts.tenantName,
    tenantId: opts.tenantId,
    adminEmail: opts.adminEmail,
    log: opts.log,
    licenseExpiresAt: opts.licenseExpiresAt,
    tenantModules: opts.tenantModules,
    maxUsers: opts.maxUsers,
    maxLocations: opts.maxLocations,
    maxOrdersPerMonth: opts.maxOrdersPerMonth,
    posHostPort: backendPort
  });
  if (rootDomain === "localhost") {
    opts.log(
      `[provision][pos] localhost dev: skipping Traefik (open POS at ${posUrl})`
    );
  } else {
    opts.log(`[provision][pos] publishing Traefik routes pos=${posUrl} api=${posApiUrl}`);
    await writePosTraefikConfig(opts.slug, backendPort, frontendPort, rootDomain);
  }
  if (opts.db) {
    await opts.db.update(tenantDeployments).set({
      posOrganizationId: bootstrap.posOrganizationId,
      posUrl,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq12(tenantDeployments.tenantId, opts.tenantId));
    opts.log(
      `[provision][pos] saved pos_organization_id=${bootstrap.posOrganizationId} pos_url=${posUrl}`
    );
  }
  return {
    ...bootstrap,
    posUrl,
    posApiUrl,
    posHostPort: backendPort
  };
}
async function provisionPosStackTracked(opts, trace) {
  await trace?.event("progress", "Starting POS stack provisioning", {
    meta: { operationKey: "pos.stack" }
  });
  try {
    const result = await provisionPosStack(opts);
    await trace?.event("pos.stack.completed", "POS stack provisioned successfully", {
      meta: {
        posOrganizationId: result.posOrganizationId,
        posUrl: result.posUrl,
        posApiUrl: result.posApiUrl
      }
    });
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await trace?.event("pos.stack.failed", `POS stack failed: ${msg}`, {
      level: "error",
      meta: { error: msg }
    });
    throw error;
  }
}
async function unpublishPosTraefik(slug) {
  await removePosTraefikConfig(slug);
}
async function stopModuleStack(slug, module, log) {
  if (module === "pos") {
    const composeFile2 = join6(repoRoot(), "infra", "pos-tenant-stack", "docker-compose.yml");
    const project2 = `stockix-pos-${slug}`;
    log(`[module-stop][pos] compose down project=${project2}`);
    await execa2(
      "docker",
      ["compose", "-f", composeFile2, "-p", project2, "down", "--remove-orphans"],
      { stdio: "pipe", reject: false }
    );
    await unpublishPosTraefik(slug);
    return;
  }
  const composeFile = join6(repoRoot(), "infra", "pms-tenant-stack", "docker-compose.yml");
  const project = `stockix-pms-${slug}`;
  log(`[module-stop][pms] compose down project=${project}`);
  await execa2(
    "docker",
    ["compose", "-f", composeFile, "-p", project, "down", "--remove-orphans"],
    { stdio: "pipe", reject: false }
  );
}
async function provisionPmsStack(opts) {
  const composeFile = join6(repoRoot(), "infra", "pms-tenant-stack", "docker-compose.yml");
  const project = `stockix-pms-${opts.slug}`;
  const pmsAppRoot = process.env.PMS_APP_ROOT ?? join6(repoRoot(), "services", "pms");
  opts.log(`[provision][pms] compose up project=${project}`);
  await execa2(
    "docker",
    ["compose", "-f", composeFile, "-p", project, "up", "-d", "--build"],
    {
      env: {
        ...process.env,
        COMPOSE_PROJECT_NAME: project,
        PMS_APP_ROOT: pmsAppRoot,
        TENANT_ID: opts.tenantId,
        AUTH_TOKEN_SECRET: apiConfig.authTokenSecret ?? "",
        PLATFORM_API_SECRET: apiConfig.platformApiSecret ?? "",
        DATABASE_URL: process.env.DATABASE_URL ?? ""
      },
      stdio: "inherit"
    }
  );
}

// ../../infra/worker-service/src/provision-journal.ts
import { asc as asc2, eq as eq13 } from "drizzle-orm";
function readPositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : void 0;
}
function readNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
async function loadProvisionJournalState(db, correlationId) {
  const rows = await db.select({
    phase: tenantProvisionEvents.phase,
    meta: tenantProvisionEvents.meta
  }).from(tenantProvisionEvents).where(eq13(tenantProvisionEvents.correlationId, correlationId)).orderBy(asc2(tenantProvisionEvents.createdAt)).limit(2e3);
  const completedOps = /* @__PURE__ */ new Set();
  const state = { completedOps };
  for (const row of rows) {
    if (row.phase !== "journal") continue;
    const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : void 0;
    const key = readNonEmptyString(meta?.operationKey);
    if (key) completedOps.add(key);
    const financeTenantId = readPositiveInt(meta?.financeTenantId);
    if (financeTenantId) state.financeTenantId = financeTenantId;
    const financeOrganizationId = readNonEmptyString(meta?.financeOrganizationId);
    if (financeOrganizationId) state.financeOrganizationId = financeOrganizationId;
    const warehouseId = readPositiveInt(meta?.primaryWarehouseId ?? meta?.financeDefaultWarehouseId);
    if (warehouseId) state.financeDefaultWarehouseId = warehouseId;
    const walkIn = readPositiveInt(meta?.walkInCustomerId);
    if (walkIn) state.walkInCustomerId = walkIn;
    const cash = readPositiveInt(meta?.cashAccountId);
    if (cash) state.cashAccountId = cash;
    const card = readPositiveInt(meta?.cardAccountId);
    if (card) state.cardAccountId = card;
    const serviceCharge = readPositiveInt(meta?.serviceChargeItemId);
    if (serviceCharge) state.serviceChargeItemId = serviceCharge;
    const discount = readPositiveInt(meta?.discountItemId);
    if (discount) state.discountItemId = discount;
  }
  return state;
}

// ../../infra/worker-service/src/provision-runtime.ts
function assertProvisionModuleEnv(modules) {
  if (modules.includes("pos")) {
    const key = posConfig.platformApiKey.trim();
    if (key.length < 10) {
      throw new Error(
        "POS_PLATFORM_API_KEY is required for POS provisioning (min 10 characters)"
      );
    }
  }
  if (modules.includes("accounting") && !apiConfig.internalApiSecret?.trim()) {
    throw new Error(
      "INTERNAL_API_SECRET is required when provisioning the accounting module"
    );
  }
}
async function runPosProvisionStep(params) {
  if (!params.licensedModules.includes("pos") || !params.tenantId) {
    return { posStatus: "skipped" };
  }
  try {
    let licenseExpiresAt = null;
    try {
      licenseExpiresAt = await getLicenseExpiry(params.db, params.tenantId);
    } catch (licenseErr) {
      const msg = licenseErr instanceof Error ? licenseErr.message : String(licenseErr);
      params.log(`[provision][pos] license expiry lookup failed (using default): ${msg}`);
    }
    const planSlug = params.planSlug?.trim() || "starter";
    const planLimits = await getPlanLimits(params.db, planSlug);
    const posResult = await provisionPosStackTracked(
      {
        slug: params.slug,
        tenantId: params.tenantId,
        tenantName: params.tenantName,
        adminEmail: params.adminEmail,
        db: params.db,
        log: params.log,
        financeInternalPort: params.financeInternalPort,
        licenseExpiresAt,
        tenantModules: params.licensedModules,
        planSlug,
        maxUsers: planLimits.maxUsers
      },
      params.trace
    );
    const credentials = posResult.posDefaultCredentials?.allRoles ?? [];
    if (credentials.length > 0 && posResult.posUrl) {
      try {
        await sendPosWelcomeEmail({
          to: params.adminEmail,
          tenantName: params.tenantName,
          posUrl: posResult.posUrl,
          credentials
        });
        params.log(`[provision][pos] credentials email sent to ${params.adminEmail}`);
      } catch (emailErr) {
        params.log(
          `[provision][pos] credentials email failed (non-fatal): ${emailErr instanceof Error ? emailErr.message : String(emailErr)}`
        );
      }
    }
    return {
      posStatus: "ok",
      posOrganizationId: posResult.posOrganizationId,
      posUrl: posResult.posUrl,
      posApiUrl: posResult.posApiUrl,
      posHostPort: posResult.posHostPort,
      posDefaultCredentials: posResult.posDefaultCredentials
    };
  } catch (posErr) {
    const posError = posErr instanceof Error ? posErr.message : String(posErr);
    params.log(`[provision][pos] failed: ${posError}`);
    return { posStatus: "failed", posError };
  }
}
async function runWirePosIntegrationStep(params) {
  if (!hasAccountingAndPos(params.licensedModules)) {
    return { ok: true };
  }
  if (!params.forceRerun && params.hasOp("tenant.wire_pos_integration")) {
    await params.trace.event("resume", "Skipping POS integration wire (already journaled)", {
      meta: { operationKey: "tenant.wire_pos_integration" }
    });
    return { ok: true };
  }
  try {
    params.log("[provision] step start: tenant.wire_pos_integration");
    await params.trace.event("progress", "Wiring POS Bigcapital integration", {
      meta: {
        operationKey: "tenant.wire_pos_integration",
        posOrganizationId: params.posOrganizationId
      }
    });
    const wired = await wirePosBigcapitalIntegration({
      posOrganizationId: params.posOrganizationId,
      posHostPort: params.posHostPort,
      slug: params.slug,
      internalPort: params.financeInternalPort,
      workerInternalUrl: params.workerInternalUrl,
      financeTenantId: params.financeTenantId,
      walkInCustomerId: params.walkInCustomerId,
      cashAccountId: params.cashAccountId,
      cardAccountId: params.cardAccountId,
      serviceChargeItemId: params.serviceChargeItemId,
      discountItemId: params.discountItemId,
      defaultWarehouseId: params.financeDefaultWarehouseId,
      log: params.log
    });
    await params.markOp("tenant.wire_pos_integration", "POS Bigcapital integration wired", {
      internalBaseUrl: wired.internalBaseUrl,
      posOrganizationId: params.posOrganizationId
    });
    params.log("[provision] step done: tenant.wire_pos_integration");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await params.trace.event("pos.integration.wire_failed", `Integration wire failed: ${msg}`, {
      level: "error",
      meta: { error: msg }
    });
    return { ok: false, error: msg };
  }
}
async function persistFinanceDeploymentIds(db, deploymentId, ids) {
  if (!deploymentId) return;
  const patch = {};
  if (ids.financeTenantId && ids.financeTenantId > 0) {
    patch.financeTenantId = ids.financeTenantId;
  }
  if (ids.financeDefaultWarehouseId && ids.financeDefaultWarehouseId > 0) {
    patch.financeDefaultWarehouseId = ids.financeDefaultWarehouseId;
  }
  if (ids.walkInCustomerId && ids.walkInCustomerId > 0) {
    patch.financeWalkInCustomerId = ids.walkInCustomerId;
  }
  if (ids.cashAccountId && ids.cashAccountId > 0) {
    patch.financeCashAccountId = ids.cashAccountId;
  }
  if (ids.cardAccountId && ids.cardAccountId > 0) {
    patch.financeCardAccountId = ids.cardAccountId;
  }
  if (Object.keys(patch).length === 0) return;
  await db.update(tenantDeployments).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq14(tenantDeployments.id, deploymentId));
}
function encryptDeploymentSecretLocal(plaintext) {
  return encryptDeploymentSecret(plaintext, apiConfig.deploymentSecretKey);
}
async function resolvePosBackendHostPort(slug) {
  const project = `stockix-pos-${slug}`;
  try {
    const { stdout } = await execa3("docker", [
      "compose",
      "-p",
      project,
      "port",
      "pos-backend",
      "8010"
    ]);
    const match = stdout.trim().match(/:(\d+)\s*$/);
    if (!match?.[1]) return null;
    return Number(match[1]);
  } catch {
    return null;
  }
}
async function resolveServerInternalUrl(params) {
  try {
    const { stdout } = await execa3(
      "docker",
      [
        "compose",
        "-f",
        params.composeFile,
        "-p",
        params.project,
        "--env-file",
        params.envPath,
        "port",
        "server",
        "3000"
      ],
      { env: params.composeEnv, extendEnv: true, stdio: "pipe" }
    );
    const trimmed = stdout.trim();
    const match = trimmed.match(/:(\d+)\s*$/);
    if (match?.[1]) {
      return `http://${params.fallbackHost}:${match[1]}`;
    }
  } catch {
  }
  return `http://${params.fallbackHost}:${params.fallbackPort}`;
}
async function executeProvisionRuntime(deps, db, input, log, correlationId, assertNotCancelled) {
  const runtimeStartedAt = Date.now();
  let tenantId;
  let deploymentId;
  const trace = createProvisionTracer(
    db,
    correlationId,
    () => ({
      slug: input.slug,
      tenantId,
      deploymentId,
      parentTenantId: input.stockixTenantId ?? null
    }),
    log
  );
  const { tenantComposeFile: composeFile, stockixFinanceRoot } = getTenantStackPaths();
  const rootDomain = apiConfig.rootDomain || "example.com";
  const publicScheme = apiConfig.publicBaseUrlScheme;
  const maxPort = apiConfig.maxTenantPort;
  const tenantEnvRoot = defaultTenantEnvRoot();
  const project = composeProjectName(input.slug);
  const mysqlVolumeName = tenantMysqlVolumeName(input.slug);
  const baseUrl = `${publicScheme}://${input.slug}.${rootDomain}`;
  const requestId = correlationId;
  let port;
  let oneTimeAdminPassword;
  let financeOrganizationId;
  let financeTenantId;
  let financeDefaultWarehouseId;
  let walkInCustomerId;
  let cashAccountId;
  let cardAccountId;
  let serviceChargeItemId;
  let discountItemId;
  let posOrganizationId;
  let posUrl;
  let posApiUrl;
  let posDefaultCredentials;
  let composeCtx = null;
  let sideEffectsStarted = false;
  const journalState = await loadProvisionJournalState(db, correlationId);
  const completedOps = journalState.completedOps;
  if (journalState.financeTenantId) financeTenantId = journalState.financeTenantId;
  if (journalState.financeOrganizationId) financeOrganizationId = journalState.financeOrganizationId;
  if (journalState.financeDefaultWarehouseId) financeDefaultWarehouseId = journalState.financeDefaultWarehouseId;
  if (journalState.walkInCustomerId) walkInCustomerId = journalState.walkInCustomerId;
  if (journalState.cashAccountId) cashAccountId = journalState.cashAccountId;
  if (journalState.cardAccountId) cardAccountId = journalState.cardAccountId;
  if (journalState.serviceChargeItemId) {
    serviceChargeItemId = journalState.serviceChargeItemId;
  }
  if (journalState.discountItemId) discountItemId = journalState.discountItemId;
  const checkNotCancelled = async () => {
    if (!assertNotCancelled) return;
    await assertNotCancelled();
  };
  const runComposeWithCancellation = async (args) => {
    log(`[compose] starting: docker compose ${args.join(" ")}`);
    const controller = new AbortController();
    const intervalId = setInterval(() => {
      checkNotCancelled().catch((error) => {
        if (!controller.signal.aborted) {
          log(
            `[compose] cancellation requested during ${args.join(" ")}: ${error instanceof Error ? error.message : String(error)}`
          );
          controller.abort(error);
        }
      });
    }, 1e3);
    try {
      const timeoutMs = resolveComposeStepTimeoutMs(args);
      let lastComposeTraceAt = 0;
      await deps.docker.run(
        composeCtx.composeFile,
        composeCtx.project,
        composeCtx.envPath,
        composeCtx.composeEnv,
        args,
        {
          cancelSignal: controller.signal,
          timeoutMs,
          onOutput: (chunk) => {
            const now = Date.now();
            if (now - lastComposeTraceAt < 4e3) return;
            const line = chunk.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0).pop();
            if (!line) return;
            if (!/pull|download|build|creating|starting|started|healthy/i.test(line)) return;
            lastComposeTraceAt = now;
            void trace.event("compose", line.slice(0, 240), { level: "info" });
          }
        }
      );
      log(`[compose] completed: docker compose ${args.join(" ")}`);
      await checkNotCancelled();
    } catch (error) {
      log(
        `[compose] failed: docker compose ${args.join(" ")} :: ${error instanceof Error ? error.message : String(error)}`
      );
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        if (reason instanceof Error) {
          throw reason;
        }
        throw new Error(typeof reason === "string" ? reason : "cancelled_by_user");
      }
      throw error;
    } finally {
      clearInterval(intervalId);
    }
  };
  const hasOp = (key) => completedOps.has(key);
  const elapsedMs = () => Date.now() - runtimeStartedAt;
  const markOp = async (operationKey, message, meta) => {
    completedOps.add(operationKey);
    await trace.event("journal", message, {
      meta: {
        operationKey,
        ...meta
      }
    });
  };
  const recordCleanupError = async (step, error) => {
    const msg = error instanceof Error ? error.message : String(error);
    try {
      await trace.event("cleanup", `non-fatal error in ${step}: ${msg}`, {
        level: "error",
        meta: { step, error: msg }
      });
    } catch {
      console.error(`[provision][${correlationId}] cleanup log failure step=${step}: ${msg}`);
    }
  };
  try {
    log(`[provision] start slug=${input.slug} correlationId=${correlationId}`);
    await checkNotCancelled();
    await mkdir3(join7(stockixFinanceRoot, "data/logs/nginx"), { recursive: true });
    await mkdir3(join7(stockixFinanceRoot, "docker/certbot/certs"), { recursive: true });
    const { secrets } = deps;
    const bootstrapPasswordKey = input.parentTenantSlug?.trim() || input.slug.trim();
    oneTimeAdminPassword = secrets.bootstrapAdminPassword(bootstrapPasswordKey);
    const jwtSecret = secrets.persistSecret(secrets.randomHex(32));
    const dbPassword = secrets.persistSecret(secrets.randomHex(16));
    const dbRootPassword = secrets.persistSecret(secrets.randomHex(16));
    const mongoUrlPersisted = "mongodb://mongo/stockix";
    const agendashUser = "agendash";
    const agendashPassword = secrets.persistSecret(secrets.randomHex(12));
    const optionalEnv = (name) => process.env[name]?.trim() ?? "";
    const s3Region = optionalEnv("S3_REGION") || "us-east-1";
    const s3AccessKeyId = optionalEnv("S3_ACCESS_KEY_ID");
    const s3SecretAccessKey = optionalEnv("S3_SECRET_ACCESS_KEY");
    const s3Endpoint = optionalEnv("S3_ENDPOINT");
    const s3Bucket = optionalEnv("S3_BUCKET");
    const s3ForcePathStyle = optionalEnv("S3_FORCE_PATH_STYLE") || "true";
    const s3Configured = s3AccessKeyId.length > 0 && s3SecretAccessKey.length > 0 && s3Endpoint.length > 0 && s3Bucket.length > 0;
    if (!s3Configured) {
      log("[provision] S3 not configured \u2014 provisioning without object storage (attachments disabled).");
    }
    const licensedModulesEarly = resolveTenantModules(input.modules);
    assertProvisionModuleEnv(licensedModulesEarly);
    const posOnlyRetry = input.retryModules?.length === 1 && input.retryModules[0] === "pos";
    const wireOnlyRetry = input.retryModules?.length === 1 && input.retryModules[0] === "wire";
    if (wireOnlyRetry) {
      const [existing] = await db.select({
        tenantId: tenants.id,
        tenantModules: tenants.modules,
        deploymentId: tenantDeployments.id,
        internalPort: tenantDeployments.internalPort,
        composeProjectName: tenantDeployments.composeProjectName,
        financeTenantId: tenantDeployments.financeTenantId,
        financeDefaultWarehouseId: tenantDeployments.financeDefaultWarehouseId,
        financeWalkInCustomerId: tenantDeployments.financeWalkInCustomerId,
        financeCashAccountId: tenantDeployments.financeCashAccountId,
        financeCardAccountId: tenantDeployments.financeCardAccountId,
        posOrganizationId: tenantDeployments.posOrganizationId,
        posUrl: tenantDeployments.posUrl
      }).from(tenants).innerJoin(tenantDeployments, eq14(tenantDeployments.tenantId, tenants.id)).where(eq14(tenants.slug, input.slug)).limit(1);
      if (!existing) {
        throw new Error(`tenant_not_found:${input.slug}`);
      }
      tenantId = existing.tenantId;
      deploymentId = existing.deploymentId;
      port = existing.internalPort;
      const retryLicensedModules = resolveTenantModules(
        parseTenantModulesJson(existing.tenantModules)
      );
      if (!hasAccountingAndPos(retryLicensedModules)) {
        throw new Error("wire_only_retry_requires_accounting_and_pos_modules");
      }
      const posOrgId = existing.posOrganizationId?.trim();
      const posHostPort = await resolvePosBackendHostPort(input.slug);
      if (!posOrgId || !posHostPort || !existing.financeTenantId || existing.financeTenantId <= 0 || !existing.financeWalkInCustomerId || !port || !existing.financeCashAccountId || !existing.financeCardAccountId) {
        throw new Error("wire_only_retry_missing_prerequisites");
      }
      await checkNotCancelled();
      const workerInternalUrl = port > 0 ? `http://${process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? apiConfig.tenantInternalHost ?? "127.0.0.1"}:${port}` : void 0;
      let retryServiceChargeItemId;
      let retryDiscountItemId;
      const internalApiSecret = apiConfig.internalApiSecret?.trim() ?? "";
      if (workerInternalUrl && internalApiSecret) {
        try {
          const seeded = await seedFinancePosDefaults({
            internalBaseUrl: workerInternalUrl,
            internalApiSecret,
            financeTenantId: existing.financeTenantId,
            correlationId,
            log
          });
          retryServiceChargeItemId = seeded.serviceChargeItemId;
          retryDiscountItemId = seeded.discountItemId;
        } catch (seedErr) {
          const seedMsg = seedErr instanceof Error ? seedErr.message : String(seedErr);
          log(`[provision][pos] bridge item seed skipped on wire retry: ${seedMsg}`);
        }
      }
      const wireResult = await runWirePosIntegrationStep({
        licensedModules: retryLicensedModules,
        slug: input.slug,
        posOrganizationId: posOrgId,
        posHostPort,
        financeInternalPort: port,
        workerInternalUrl,
        financeTenantId: existing.financeTenantId,
        walkInCustomerId: existing.financeWalkInCustomerId,
        cashAccountId: existing.financeCashAccountId,
        cardAccountId: existing.financeCardAccountId,
        serviceChargeItemId: retryServiceChargeItemId,
        discountItemId: retryDiscountItemId,
        financeDefaultWarehouseId: existing.financeDefaultWarehouseId ?? void 0,
        log,
        trace,
        markOp,
        hasOp,
        forceRerun: true
      });
      if (!wireResult.ok) {
        await markTenantPartial(db, {
          tenantId,
          kind: "wire_failed",
          lastError: wireResult.error
        });
        return {
          ok: true,
          tenantId,
          deploymentId,
          composeProjectName: existing.composeProjectName,
          internalPort: port,
          baseUrl: `${publicScheme}://${input.slug}.${rootDomain}`,
          oneTimeAdminPassword,
          posStatus: "ok",
          posError: wireResult.error,
          tenantStatus: "partial",
          posOrganizationId: posOrgId,
          posUrl: existing.posUrl ?? void 0
        };
      }
      await clearTenantPartialState(db, tenantId, "active");
      log(`[provision] Wire-only retry success slug=${input.slug}`);
      return {
        ok: true,
        tenantId,
        deploymentId,
        composeProjectName: existing.composeProjectName,
        internalPort: port,
        baseUrl: `${publicScheme}://${input.slug}.${rootDomain}`,
        oneTimeAdminPassword,
        posStatus: "ok",
        tenantStatus: "active",
        posOrganizationId: posOrgId,
        posUrl: existing.posUrl ?? void 0
      };
    }
    if (posOnlyRetry) {
      const [existing] = await db.select({
        tenantId: tenants.id,
        tenantModules: tenants.modules,
        deploymentId: tenantDeployments.id,
        internalPort: tenantDeployments.internalPort,
        composeProjectName: tenantDeployments.composeProjectName,
        financeTenantId: tenantDeployments.financeTenantId,
        financeDefaultWarehouseId: tenantDeployments.financeDefaultWarehouseId,
        financeWalkInCustomerId: tenantDeployments.financeWalkInCustomerId,
        financeCashAccountId: tenantDeployments.financeCashAccountId,
        financeCardAccountId: tenantDeployments.financeCardAccountId
      }).from(tenants).innerJoin(tenantDeployments, eq14(tenantDeployments.tenantId, tenants.id)).where(eq14(tenants.slug, input.slug)).limit(1);
      if (!existing) {
        throw new Error(`tenant_not_found:${input.slug}`);
      }
      tenantId = existing.tenantId;
      deploymentId = existing.deploymentId;
      port = existing.internalPort;
      const retryLicensedModules = resolveTenantModules(
        parseTenantModulesJson(existing.tenantModules)
      );
      await checkNotCancelled();
      const posOutcome2 = await runPosProvisionStep({
        licensedModules: retryLicensedModules,
        slug: input.slug,
        tenantId,
        tenantName: input.name,
        adminEmail: input.adminEmail,
        planSlug: input.planSlug,
        financeInternalPort: port,
        db,
        log,
        trace
      });
      if (posOutcome2.posStatus === "ok") {
        let tenantStatus = "active";
        let wireError;
        const shouldWire = hasAccountingAndPos(retryLicensedModules) && existing.financeTenantId != null && existing.financeTenantId > 0 && existing.financeWalkInCustomerId != null && existing.financeWalkInCustomerId > 0;
        if (shouldWire && posOutcome2.posOrganizationId && posOutcome2.posHostPort && port && existing.financeCashAccountId && existing.financeCashAccountId > 0 && existing.financeCardAccountId && existing.financeCardAccountId > 0) {
          const workerInternalUrl = port > 0 ? `http://${process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? apiConfig.tenantInternalHost ?? "127.0.0.1"}:${port}` : void 0;
          let retryServiceChargeItemId;
          let retryDiscountItemId;
          const internalApiSecret = apiConfig.internalApiSecret?.trim() ?? "";
          if (workerInternalUrl && internalApiSecret) {
            try {
              const seeded = await seedFinancePosDefaults({
                internalBaseUrl: workerInternalUrl,
                internalApiSecret,
                financeTenantId: existing.financeTenantId,
                correlationId,
                log
              });
              retryServiceChargeItemId = seeded.serviceChargeItemId;
              retryDiscountItemId = seeded.discountItemId;
            } catch (seedErr) {
              const seedMsg = seedErr instanceof Error ? seedErr.message : String(seedErr);
              log(`[provision][pos] bridge item seed skipped on retry: ${seedMsg}`);
            }
          }
          const wireResult = await runWirePosIntegrationStep({
            licensedModules: retryLicensedModules,
            slug: input.slug,
            posOrganizationId: posOutcome2.posOrganizationId,
            posHostPort: posOutcome2.posHostPort,
            financeInternalPort: port,
            workerInternalUrl,
            financeTenantId: existing.financeTenantId,
            walkInCustomerId: existing.financeWalkInCustomerId,
            cashAccountId: existing.financeCashAccountId,
            cardAccountId: existing.financeCardAccountId,
            serviceChargeItemId: retryServiceChargeItemId,
            discountItemId: retryDiscountItemId,
            financeDefaultWarehouseId: existing.financeDefaultWarehouseId ?? void 0,
            log,
            trace,
            markOp,
            hasOp,
            forceRerun: true
          });
          if (!wireResult.ok) {
            tenantStatus = "partial";
            wireError = wireResult.error;
            await markTenantPartial(db, {
              tenantId,
              kind: "wire_failed",
              lastError: wireError
            });
          } else {
            await clearTenantPartialState(db, tenantId, "active");
            await trace.event("progress", "Integration re-wired on retry", {
              meta: { operationKey: "tenant.wire_pos_integration" }
            });
          }
        } else if (tenantStatus === "active") {
          await clearTenantPartialState(db, tenantId, "active");
        }
        await db.update(tenantDeployments).set({
          status: "active",
          ...wireError ? {} : { lastError: null, partialFailureKind: null },
          updatedAt: /* @__PURE__ */ new Date(),
          ...posOutcome2.posOrganizationId ? { posOrganizationId: posOutcome2.posOrganizationId } : {},
          ...posOutcome2.posUrl ? { posUrl: posOutcome2.posUrl } : {}
        }).where(eq14(tenantDeployments.tenantId, tenantId));
        if (tenantStatus === "partial" && !wireError) {
          await db.update(tenants).set({ status: "partial" }).where(eq14(tenants.id, tenantId));
        }
        log(`[provision] POS-only retry success slug=${input.slug}`);
        return {
          ok: true,
          tenantId,
          deploymentId,
          composeProjectName: existing.composeProjectName,
          internalPort: port,
          baseUrl: `${publicScheme}://${input.slug}.${rootDomain}`,
          oneTimeAdminPassword,
          posStatus: "ok",
          tenantStatus,
          posOrganizationId: posOutcome2.posOrganizationId,
          posUrl: posOutcome2.posUrl,
          posApiUrl: posOutcome2.posApiUrl,
          posDefaultCredentials: posOutcome2.posDefaultCredentials,
          ...wireError ? { posError: wireError } : {}
        };
      }
      const posError = posOutcome2.posError ?? "POS provisioning failed";
      await markTenantPartial(db, {
        tenantId,
        kind: "pos_failed",
        lastError: posError
      });
      return {
        ok: true,
        tenantId,
        deploymentId,
        composeProjectName: existing.composeProjectName,
        internalPort: port,
        baseUrl: `${publicScheme}://${input.slug}.${rootDomain}`,
        oneTimeAdminPassword,
        posStatus: "failed",
        posError,
        tenantStatus: "partial",
        posOrganizationId: posOutcome2.posOrganizationId,
        posUrl: posOutcome2.posUrl,
        posApiUrl: posOutcome2.posApiUrl
      };
    }
    const existingSlug = await db.select({ id: tenants.id }).from(tenants).where(eq14(tenants.slug, input.slug)).limit(1);
    if (existingSlug.length > 0) {
      throw new Error(`tenant_slug_exists:${input.slug}`);
    }
    const organizationNumber = await allocateOrganizationNumber(db);
    await db.transaction(async (tx) => {
      const allocated = await allocateTenantPort(tx, maxPort);
      port = allocated;
      const moduleList = resolveTenantModules(input.modules);
      const [tRow] = await tx.insert(tenants).values({
        slug: input.slug,
        name: input.name,
        ownerId: input.ownerId,
        adminEmail: input.adminEmail,
        adminFirstName: input.adminFirstName,
        adminLastName: input.adminLastName,
        status: "provisioning",
        planSlug: input.planSlug ?? "starter",
        modules: JSON.stringify(moduleList),
        organizationNumber
      }).returning({ id: tenants.id });
      tenantId = tRow.id;
      const [dRow] = await tx.insert(tenantDeployments).values({
        tenantId,
        status: "provisioning",
        composeProjectName: project,
        internalPort: allocated,
        mysqlPassword: encryptDeploymentSecretLocal(dbPassword),
        mysqlRootPassword: encryptDeploymentSecretLocal(dbRootPassword),
        jwtSecret: encryptDeploymentSecretLocal(jwtSecret),
        mongoUrl: mongoUrlPersisted
      }).returning({ id: tenantDeployments.id });
      deploymentId = dRow.id;
    });
    if (port === void 0) {
      throw new Error("provision_internal: expected allocated port after transaction");
    }
    await checkNotCancelled();
    const licensedModules = resolveTenantModules(input.modules);
    const moduleGating = isModuleGatingEnabled();
    if (moduleGating && !shouldProvisionFinanceStack(licensedModules)) {
      log(`[provision] module gating: skipping Finance stack (modules=${licensedModules.join(",")})`);
      const posOutcome2 = await runPosProvisionStep({
        licensedModules,
        slug: input.slug,
        tenantId,
        tenantName: input.name,
        adminEmail: input.adminEmail,
        planSlug: input.planSlug,
        financeInternalPort: port,
        db,
        log,
        trace
      });
      if (posOutcome2.posStatus === "failed") {
        const posError = posOutcome2.posError ?? "POS provisioning failed";
        if (tenantId) {
          await db.update(tenants).set({ status: "failed" }).where(eq14(tenants.id, tenantId));
          await db.update(tenantDeployments).set({ status: "failed", lastError: posError, updatedAt: /* @__PURE__ */ new Date() }).where(eq14(tenantDeployments.tenantId, tenantId));
        }
        return { ok: false, message: posError, cause: posError };
      }
      if (posOutcome2.posStatus === "ok") {
        posOrganizationId = posOutcome2.posOrganizationId;
        posUrl = posOutcome2.posUrl;
        posApiUrl = posOutcome2.posApiUrl;
        posDefaultCredentials = posOutcome2.posDefaultCredentials;
      }
      if (licensedModules.includes("pms") && tenantId) {
        await provisionPmsStack({ slug: input.slug, tenantId, log });
      }
      if (licensedModules.includes("chat") && tenantId) {
        await provisionChatwootAccount({
          db,
          tenantId,
          tenantName: input.name,
          adminEmail: input.adminEmail,
          chatwootBaseUrl: process.env.CHATWOOT_BASE_URL ?? "",
          chatwootApiKey: process.env.CHATWOOT_API_ACCESS_TOKEN ?? "",
          log
        });
      }
      await db.update(tenants).set({ status: "active" }).where(eq14(tenants.id, tenantId));
      await db.update(tenantDeployments).set({ status: "active", lastError: null, updatedAt: /* @__PURE__ */ new Date() }).where(eq14(tenantDeployments.tenantId, tenantId));
      return {
        ok: true,
        tenantId,
        deploymentId,
        composeProjectName: project,
        internalPort: port,
        baseUrl,
        oneTimeAdminPassword: oneTimeAdminPassword ?? randomBytes(12).toString("base64url"),
        financeOrganizationId,
        financeTenantId,
        financeDefaultWarehouseId,
        posOrganizationId,
        posUrl,
        posApiUrl,
        posDefaultCredentials,
        posStatus: posOutcome2.posStatus === "ok" ? "ok" : "skipped"
      };
    }
    let stockixAppName = input.name;
    let stockixLogoUrl = "";
    let stockixPrimaryColor = "#ca8a04";
    if (tenantId) {
      const [cfg] = await db.select({
        appName: tenantConfig.appName,
        logoUrl: tenantConfig.logoUrl,
        primaryColor: tenantConfig.primaryColor
      }).from(tenantConfig).where(eq14(tenantConfig.tenantId, tenantId)).limit(1);
      if (cfg) {
        stockixAppName = cfg.appName ?? stockixAppName;
        stockixLogoUrl = cfg.logoUrl ?? "";
        stockixPrimaryColor = cfg.primaryColor ?? stockixPrimaryColor;
      }
    }
    const tenantEnvMap = buildTenantEnvMap({
      mysqlVolumeName,
      stockixFinanceRoot,
      baseUrl,
      jwtSecret,
      dbPassword,
      dbRootPassword,
      publicProxyPort: port,
      adminEmail: input.adminEmail,
      agendashUser,
      agendashPassword,
      s3Region,
      s3AccessKeyId,
      s3SecretAccessKey,
      s3Endpoint,
      s3Bucket,
      s3ForcePathStyle,
      stockixTenantId: input.stockixTenantId,
      stockixApiUrl: input.stockixApiUrl,
      internalApiSecret: apiConfig.internalApiSecret,
      stockixAppName,
      stockixLogoUrl,
      stockixPrimaryColor
    });
    const envPath = await writeTenantEnvFileAtomic(join7(tenantEnvRoot, input.slug), tenantEnvMap);
    if (!tenantEnvMap.MAIL_PASSWORD?.trim() || !tenantEnvMap.MAIL_FROM_ADDRESS?.trim()) {
      log(
        "[provision][mail] tenant .env missing MAIL_PASSWORD or MAIL_FROM_ADDRESS \u2014 Finance invite/reset emails will not send"
      );
      await trace.event(
        "mail.env_incomplete",
        "Tenant mail env incomplete (MAIL_PASSWORD or MAIL_FROM_ADDRESS missing)",
        { level: "warn" }
      );
    }
    const composeEnv = {
      ...tenantEnvMap,
      COMPOSE_PROJECT_NAME: project
    };
    composeCtx = { composeFile, project, envPath, composeEnv };
    const { docker, finance, edge } = deps;
    await checkNotCancelled();
    const staleContainersRaw = await execa3(
      "docker",
      ["ps", "-a", "--filter", `name=${project}`, "--format", "{{.Names}}"],
      { stdio: "pipe" }
    ).then(({ stdout }) => stdout).catch(() => "");
    const staleContainers = staleContainersRaw.split("\n").map((v) => v.trim()).filter((v) => v.length > 0);
    if (staleContainers.length > 0) {
      await trace.event("preflight.cleanup", "Detected stale project containers before provision", {
        level: "warn",
        meta: { composeProjectName: project, staleContainers }
      });
    }
    await docker.run(
      composeCtx.composeFile,
      composeCtx.project,
      composeCtx.envPath,
      composeCtx.composeEnv,
      ["down", "--remove-orphans", "-v", "--timeout", "10"],
      { timeoutMs: COMPOSE_DOWN_TIMEOUT_MS }
    ).catch(() => void 0);
    await trace.event("preflight.cleanup", "completed", {
      meta: { composeProjectName: project }
    });
    sideEffectsStarted = true;
    await checkNotCancelled();
    if (!hasOp("docker.data_step")) {
      log("[provision] step start: docker.data_step");
      await runComposeWithCancellation([
        "up",
        "-d",
        "--no-deps",
        "--remove-orphans",
        "mysql",
        "mongo",
        "redis"
      ]);
      await markOp("docker.data_step", "Data services compose step completed", {
        composeProjectName: project
      });
      log("[provision] step done: docker.data_step");
    } else {
      await trace.event("resume", "Skipping data step (already journaled)", {
        meta: { operationKey: "docker.data_step", composeProjectName: project }
      });
    }
    await checkNotCancelled();
    if (!hasOp("docker.migration_step")) {
      log("[provision] step start: docker.migration_step");
      log("database_migration");
      await runComposeWithCancellation(["run", "--rm", "--build", "database_migration"]);
      await markOp("docker.migration_step", "Migration compose step completed", {
        composeProjectName: project,
        elapsedMs: elapsedMs()
      });
      await trace.event("progress", "Post-migration checkpoint reached", {
        meta: { operationKey: "docker.migration_step", elapsedMs: elapsedMs() }
      });
      log("[provision] step done: docker.migration_step");
    } else {
      await trace.event("resume", "Skipping migration step (already journaled)", {
        meta: { operationKey: "docker.migration_step", composeProjectName: project }
      });
    }
    await checkNotCancelled();
    if (!hasOp("docker.app_step")) {
      log("[provision] step start: docker.app_step");
      await trace.event("progress", "Starting app compose step", {
        meta: { operationKey: "docker.app_step", elapsedMs: elapsedMs() }
      });
      await runComposeWithCancellation([
        "up",
        "-d",
        "--remove-orphans",
        "--force-recreate",
        "webapp",
        "nginx",
        "server"
      ]);
      await markOp("docker.app_step", "Application compose step completed", {
        composeProjectName: project,
        elapsedMs: elapsedMs()
      });
      log("[provision] step done: docker.app_step");
    } else {
      await trace.event("resume", "Skipping app step (already journaled)", {
        meta: { operationKey: "docker.app_step", composeProjectName: project }
      });
    }
    await checkNotCancelled();
    const internalUrl = await resolveServerInternalUrl({
      composeFile,
      project,
      envPath: composeCtx.envPath,
      composeEnv: composeCtx.composeEnv,
      fallbackHost: apiConfig.tenantInternalHost,
      fallbackPort: port
    });
    if (!hasOp("tenant.health_check")) {
      log("[provision] step start: tenant.health_check");
      await trace.event("progress", "Waiting for tenant health endpoint", {
        meta: { operationKey: "tenant.health_check", elapsedMs: elapsedMs(), internalUrl }
      });
      await finance.waitUntilReady(
        internalUrl,
        STOCKIX_FINANCE_HEALTH_TIMEOUT_MS,
        log,
        requestId,
        trace
      );
      await markOp("tenant.health_check", "Tenant health check completed", { internalUrl, elapsedMs: elapsedMs() });
      log("[provision] step done: tenant.health_check");
    } else {
      await trace.event("resume", "Skipping health check (already journaled)", {
        meta: { operationKey: "tenant.health_check", internalUrl }
      });
    }
    await checkNotCancelled();
    if (!hasOp("tenant.bootstrap_admin")) {
      log("[provision] step start: tenant.bootstrap_admin");
      await trace.event("progress", "Starting bootstrap admin registration", {
        meta: { operationKey: "tenant.bootstrap_admin", elapsedMs: elapsedMs(), adminEmail: input.adminEmail }
      });
      const internalApiSecret = apiConfig.internalApiSecret;
      if (!internalApiSecret) {
        throw new Error(
          "INTERNAL_API_SECRET is required for bootstrap admin provisioning"
        );
      }
      const bootstrapResult = await finance.registerBootstrapAdmin({
        internalBaseUrl: internalUrl,
        internalApiSecret,
        firstName: input.adminFirstName,
        lastName: input.adminLastName,
        email: input.adminEmail,
        password: oneTimeAdminPassword,
        organizationNumber,
        log,
        requestId,
        trace
      });
      financeTenantId = bootstrapResult.tenantId;
      await persistFinanceDeploymentIds(db, deploymentId, {
        financeTenantId: bootstrapResult.tenantId
      });
      await markOp("tenant.bootstrap_admin", "Tenant bootstrap admin registered", {
        internalBaseUrl: internalUrl,
        adminEmail: input.adminEmail,
        financeTenantId: bootstrapResult.tenantId,
        elapsedMs: elapsedMs()
      });
      log("[provision] step done: tenant.bootstrap_admin");
    } else {
      await trace.event("resume", "Skipping bootstrap admin registration (already journaled)", {
        meta: { operationKey: "tenant.bootstrap_admin", adminEmail: input.adminEmail }
      });
      if (!financeTenantId && deploymentId) {
        const [deployRow] = await db.select({ financeTenantId: tenantDeployments.financeTenantId }).from(tenantDeployments).where(eq14(tenantDeployments.id, deploymentId)).limit(1);
        const fromDb = deployRow?.financeTenantId;
        if (fromDb != null && fromDb > 0) {
          financeTenantId = fromDb;
          log(`[provision] Restored financeTenantId=${financeTenantId} from tenant_deployments on resume`);
        }
      }
    }
    await checkNotCancelled();
    let inheritedSettings = {
      ...MENA_DEFAULTS,
      name: input.name
    };
    if (input.parentTenantSlug?.trim()) {
      const mainBase = input.mainTenantInternalBaseUrl?.trim();
      if (!mainBase) {
        if (!hasOp("tenant.fetch_org_settings")) {
          log("[provision] step start: tenant.fetch_org_settings");
          log("[provision] No main tenant internal base URL; skipping settings fetch");
          await markOp("tenant.fetch_org_settings", "Skipped settings fetch (no main base URL)", {
            parentTenantSlug: input.parentTenantSlug
          });
          log("[provision] step done: tenant.fetch_org_settings");
        }
      } else if (!hasOp("tenant.build_organization")) {
        log("[provision] step start: tenant.fetch_org_settings");
        try {
          const mainPassword = secrets.bootstrapAdminPassword(input.parentTenantSlug.trim());
          const fetched = await finance.fetchOrgSettings({
            mainInternalBaseUrl: mainBase,
            adminEmail: input.adminEmail,
            adminPassword: mainPassword,
            correlationId
          });
          if (fetched) {
            inheritedSettings = { ...fetched, name: input.name };
            log("[provision] Using inherited settings from main org");
          } else {
            log("[provision] Main org not reachable or not built; using MENA defaults");
          }
          if (!hasOp("tenant.fetch_org_settings")) {
            await markOp("tenant.fetch_org_settings", "Org settings fetch completed", {
              inherited: Boolean(fetched)
            });
          } else {
            await trace.event("resume", "Refreshed org settings from main before build retry", {
              meta: { operationKey: "tenant.fetch_org_settings", inherited: Boolean(fetched) }
            });
          }
        } catch (err) {
          log(
            `[provision] Settings fetch failed, using defaults: ${err instanceof Error ? err.message : String(err)}`
          );
          if (!hasOp("tenant.fetch_org_settings")) {
            await markOp("tenant.fetch_org_settings", "Org settings fetch failed; using defaults", {
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }
        log("[provision] step done: tenant.fetch_org_settings");
      } else if (hasOp("tenant.fetch_org_settings")) {
        await trace.event("resume", "Skipping org settings fetch (organization build already journaled)", {
          meta: { operationKey: "tenant.fetch_org_settings" }
        });
      }
    }
    await checkNotCancelled();
    if (!hasOp("tenant.build_organization")) {
      log("[provision] step start: tenant.build_organization");
      await trace.event("progress", "Building organization database and seeding defaults", {
        meta: { operationKey: "tenant.build_organization", elapsedMs: elapsedMs() }
      });
      try {
        const buildResult = await finance.buildOrganization(
          {
            internalBaseUrl: internalUrl,
            adminEmail: input.adminEmail,
            adminPassword: secrets.bootstrapAdminPassword(bootstrapPasswordKey),
            settings: inheritedSettings,
            correlationId
          },
          log
        );
        if (!buildResult.ok) {
          throw new Error(buildResult.error ?? "Organization build failed");
        }
        if (buildResult.financeOrganizationId) {
          financeOrganizationId = buildResult.financeOrganizationId;
        }
        if (input.controlPlaneOrgId && buildResult.financeOrganizationId) {
          const apiBase = `http://localhost:${apiConfig.port}`;
          const saveUrl = `${apiBase}/internal/organizations/${input.controlPlaneOrgId}`;
          const secret = apiConfig.workerSecret;
          try {
            const saveRes = await fetch(saveUrl, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                ...secret ? { Authorization: `Bearer ${secret}` } : {}
              },
              body: JSON.stringify({
                financeOrganizationId: buildResult.financeOrganizationId
              }),
              signal: AbortSignal.timeout(1e4)
            });
            if (!saveRes.ok) {
              log(
                `[provision] Warning: failed to save financeOrganizationId: ${saveRes.status}`
              );
            } else {
              log("[provision] Saved financeOrganizationId mapping");
            }
          } catch (err) {
            log(
              `[provision] Warning: failed to save financeOrganizationId: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
        if (input.adminEmail && internalUrl && buildResult.financeOrganizationId) {
          const internalSecret = apiConfig.internalApiSecret;
          if (internalSecret) {
            try {
              const attachUrl = `${internalUrl.replace(/\/+$/, "")}/api/internal/attach-user-to-tenant`;
              const attachRes = await fetch(attachUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": internalSecret
                },
                body: JSON.stringify({
                  email: input.adminEmail,
                  organization_id: buildResult.financeOrganizationId
                }),
                signal: AbortSignal.timeout(1e4)
              });
              if (!attachRes.ok) {
                log(`[provision] Warning: attach-user failed ${attachRes.status}`);
              } else {
                log("[provision] Admin user attached to org");
              }
            } catch (err) {
              log(
                `[provision] Warning: attach-user error: ${err instanceof Error ? err.message : String(err)}`
              );
            }
          } else {
            log("[provision] Warning: INTERNAL_API_SECRET not configured; skipping attach-user");
          }
        }
        await markOp("tenant.build_organization", "Organization build completed", {
          alreadyBuilt: buildResult.alreadyBuilt === true,
          elapsedMs: elapsedMs(),
          ...buildResult.financeOrganizationId ? { financeOrganizationId: buildResult.financeOrganizationId } : {}
        });
        await trace.event(
          "progress",
          buildResult.alreadyBuilt ? "Organization was already built (skipped)" : "Organization built and seeded successfully",
          {
            meta: { operationKey: "tenant.build_organization", elapsedMs: elapsedMs() }
          }
        );
        log("[provision] step done: tenant.build_organization");
        if (financeTenantId && internalUrl && !hasOp("tenant.complete_setup_wizard")) {
          const setupResult = await completeFinanceSetupWizard({
            internalBaseUrl: internalUrl,
            financeTenantId,
            log
          });
          if (setupResult.ok) {
            await markOp("tenant.complete_setup_wizard", "Setup wizard marked complete", {
              financeTenantId
            });
          } else {
            log(`[provision] setup wizard complete skipped: ${setupResult.error}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await trace.event(
          "progress",
          `Organization build failed: ${msg}`,
          {
            level: "error",
            meta: { operationKey: "tenant.build_organization", error: msg }
          }
        );
        throw err;
      }
    } else {
      await trace.event("resume", "Skipping organization build (already journaled)", {
        meta: { operationKey: "tenant.build_organization" }
      });
    }
    if (isSeparateStackSubOrg({
      parentTenantSlug: input.parentTenantSlug,
      mainTenantInternalBaseUrl: input.mainTenantInternalBaseUrl,
      childInternalUrl: internalUrl
    }) && financeTenantId && apiConfig.internalApiSecret && input.mainTenantInternalBaseUrl?.trim() && internalUrl) {
      try {
        log("[provision] Cross-stack COA copy from parent Finance stack");
        await copyCoaAcrossStacks({
          parentInternalUrl: input.mainTenantInternalBaseUrl.trim(),
          childInternalUrl: internalUrl,
          parentTenantId: 0,
          childTenantId: financeTenantId,
          internalSecret: apiConfig.internalApiSecret,
          adminEmail: input.adminEmail,
          correlationId,
          log
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`[provision] Cross-stack COA copy failed (non-fatal): ${msg}`);
        await trace.event("tenant.copy_coa", "Cross-stack chart of accounts copy failed", {
          level: "warn",
          meta: { error: msg }
        });
      }
    }
    await checkNotCancelled();
    if (!hasOp("tenant.activate_warehouses")) {
      const internalApiSecret = apiConfig.internalApiSecret;
      if (financeTenantId && internalUrl && internalApiSecret) {
        log("[provision] step start: tenant.activate_warehouses");
        await trace.event("progress", "Activating Finance primary warehouse", {
          meta: {
            operationKey: "tenant.activate_warehouses",
            financeTenantId,
            elapsedMs: elapsedMs()
          }
        });
        try {
          const warehouseResult = await activateFinanceWarehouses({
            internalBaseUrl: internalUrl,
            internalApiSecret,
            financeTenantId,
            correlationId,
            log
          });
          financeDefaultWarehouseId = warehouseResult.primaryWarehouseId;
          await markOp("tenant.activate_warehouses", "Finance warehouses activated", {
            financeTenantId,
            primaryWarehouseId: warehouseResult.primaryWarehouseId,
            alreadyActivated: warehouseResult.alreadyActivated,
            elapsedMs: elapsedMs()
          });
          await trace.event("warehouses.activated", "Primary warehouse ready for POS sync", {
            meta: {
              financeTenantId,
              primaryWarehouseId: warehouseResult.primaryWarehouseId,
              alreadyActivated: warehouseResult.alreadyActivated
            }
          });
          log("[provision] step done: tenant.activate_warehouses");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await trace.event("warehouses.activated", `Warehouse activation failed: ${msg}`, {
            level: "error",
            meta: { financeTenantId, error: msg }
          });
          throw err;
        }
      } else {
        log(
          "[provision] Skipping warehouse activation (missing financeTenantId, internal URL, or INTERNAL_API_SECRET)"
        );
        await markOp("tenant.activate_warehouses", "Skipped warehouse activation", {
          skipped: true,
          hasFinanceTenantId: Boolean(financeTenantId)
        });
      }
    } else {
      await trace.event("resume", "Skipping warehouse activation (already journaled)", {
        meta: { operationKey: "tenant.activate_warehouses" }
      });
    }
    await checkNotCancelled();
    if (!hasOp("tenant.seed_pos_defaults")) {
      const internalApiSecret = apiConfig.internalApiSecret;
      const seedPosDefaults = hasAccountingAndPos(licensedModules) && financeTenantId && internalUrl && internalApiSecret;
      if (seedPosDefaults) {
        log("[provision] step start: tenant.seed_pos_defaults");
        await trace.event("progress", "Seeding Finance POS defaults (walk-in customer, deposit accounts)", {
          meta: {
            operationKey: "tenant.seed_pos_defaults",
            financeTenantId,
            elapsedMs: elapsedMs()
          }
        });
        try {
          const seeded = await seedFinancePosDefaults({
            internalBaseUrl: internalUrl,
            internalApiSecret,
            financeTenantId,
            correlationId,
            log
          });
          walkInCustomerId = seeded.walkInCustomerId;
          cashAccountId = seeded.cashAccountId;
          cardAccountId = seeded.cardAccountId;
          serviceChargeItemId = seeded.serviceChargeItemId;
          discountItemId = seeded.discountItemId;
          await persistFinanceDeploymentIds(db, deploymentId, {
            financeTenantId,
            financeDefaultWarehouseId,
            walkInCustomerId,
            cashAccountId,
            cardAccountId
          });
          await markOp("tenant.seed_pos_defaults", "Finance POS defaults seeded", {
            financeTenantId,
            walkInCustomerId,
            cashAccountId,
            cardAccountId,
            serviceChargeItemId,
            discountItemId,
            elapsedMs: elapsedMs()
          });
          await trace.event("pos_defaults_seeded", "Walk-in customer and deposit accounts ready", {
            meta: {
              walkInCustomerId,
              cashAccountId,
              cardAccountId,
              serviceChargeItemId,
              discountItemId
            }
          });
          log("[provision] step done: tenant.seed_pos_defaults");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await trace.event("pos_defaults_seeded", `POS defaults seed failed: ${msg}`, {
            level: "error",
            meta: { financeTenantId, error: msg }
          });
          throw err;
        }
      } else {
        log(
          `[provision] Skipping POS defaults seed (modules=${licensedModules.join(",")}, financeTenantId=${financeTenantId ?? "n/a"})`
        );
        await markOp("tenant.seed_pos_defaults", "Skipped POS defaults seed", {
          skipped: true,
          modules: licensedModules
        });
      }
    } else {
      await trace.event("resume", "Skipping POS defaults seed (already journaled)", {
        meta: { operationKey: "tenant.seed_pos_defaults" }
      });
    }
    await checkNotCancelled();
    if (!hasOp("edge.publish")) {
      log("[provision] step start: edge.publish");
      try {
        await edge.publish(input.slug, port, rootDomain);
      } catch (error) {
        await trace.event("edge", "Traefik edge publish failed", {
          level: "error",
          meta: {
            slug: input.slug,
            internalPort: port,
            error: error instanceof Error ? error.message : String(error)
          }
        });
        throw error;
      }
      await markOp("edge.publish", "Traefik edge publish completed", {
        slug: input.slug,
        internalPort: port
      });
      log("[provision] step done: edge.publish");
    } else {
      await trace.event("resume", "Skipping edge publish (already journaled)", {
        meta: { operationKey: "edge.publish", slug: input.slug, internalPort: port }
      });
    }
    if (financeTenantId && internalUrl) {
      const planSlug = input.planSlug ?? "starter";
      const planLimits = await getPlanLimits(db, planSlug);
      await syncFinanceLicense(
        internalUrl,
        {
          tenantId: financeTenantId,
          planSlug,
          status: "active",
          isPerpetual: true,
          maxOrganizations: planLimits.maxOrganizations,
          maxActivations: planLimits.maxActivations,
          maxUsers: planLimits.maxUsers
        },
        log
      );
    }
    let forceWireRerun = wireOnlyRetry;
    if (tenantId) {
      const [partialRow] = await db.select({
        tenantStatus: tenants.status,
        partialFailureKind: tenantDeployments.partialFailureKind
      }).from(tenants).innerJoin(tenantDeployments, eq14(tenantDeployments.tenantId, tenants.id)).where(eq14(tenants.id, tenantId)).limit(1);
      if (partialRow?.tenantStatus === "partial" && partialRow.partialFailureKind === "wire_failed") {
        forceWireRerun = true;
      }
    }
    const posOutcome = await runPosProvisionStep({
      licensedModules,
      slug: input.slug,
      tenantId,
      tenantName: input.name,
      adminEmail: input.adminEmail,
      planSlug: input.planSlug,
      financeInternalPort: port,
      db,
      log,
      trace
    });
    let integrationWired = false;
    if (posOutcome.posStatus === "ok") {
      posOrganizationId = posOutcome.posOrganizationId;
      posUrl = posOutcome.posUrl;
      posApiUrl = posOutcome.posApiUrl;
      posDefaultCredentials = posOutcome.posDefaultCredentials;
      if (posOrganizationId && posOutcome.posHostPort && financeTenantId && walkInCustomerId && cashAccountId && cardAccountId && port) {
        const wireResult = await runWirePosIntegrationStep({
          licensedModules,
          slug: input.slug,
          posOrganizationId,
          posHostPort: posOutcome.posHostPort,
          financeInternalPort: port,
          workerInternalUrl: internalUrl,
          financeTenantId,
          walkInCustomerId,
          cashAccountId,
          cardAccountId,
          serviceChargeItemId,
          discountItemId,
          financeDefaultWarehouseId,
          log,
          trace,
          markOp,
          hasOp,
          forceRerun: forceWireRerun
        });
        if (!wireResult.ok) {
          const wireError = wireResult.error;
          if (hasAccountingAndPos(licensedModules) && tenantId) {
            await markTenantPartial(db, {
              tenantId,
              kind: "wire_failed",
              lastError: wireError
            });
            log(
              `[provision] Finance+POS active but integration wire failed \u2014 tenant partial slug=${input.slug}`
            );
            return {
              ok: true,
              tenantId,
              deploymentId,
              composeProjectName: project,
              internalPort: port,
              baseUrl,
              oneTimeAdminPassword,
              financeOrganizationId,
              financeTenantId,
              financeDefaultWarehouseId,
              walkInCustomerId,
              cashAccountId,
              cardAccountId,
              posOrganizationId,
              posUrl,
              posApiUrl,
              posDefaultCredentials,
              posStatus: "ok",
              posError: wireError,
              tenantStatus: "partial"
            };
          }
        } else {
          integrationWired = true;
        }
      }
    }
    if (posOutcome.posStatus === "failed" && tenantId) {
      const posError = posOutcome.posError ?? "POS provisioning failed";
      if (hasAccountingAndPos(licensedModules)) {
        await markTenantPartial(db, {
          tenantId,
          kind: "pos_failed",
          lastError: posError
        });
        log(`[provision] Finance active, POS failed \u2014 tenant marked partial slug=${input.slug}`);
        return {
          ok: true,
          tenantId,
          deploymentId,
          composeProjectName: project,
          internalPort: port,
          baseUrl,
          oneTimeAdminPassword,
          financeOrganizationId,
          financeTenantId,
          financeDefaultWarehouseId,
          walkInCustomerId,
          cashAccountId,
          cardAccountId,
          posStatus: "failed",
          posError,
          tenantStatus: "partial"
        };
      }
      if (isPosOnlyModules(licensedModules)) {
        await db.update(tenants).set({ status: "failed" }).where(eq14(tenants.id, tenantId));
        await db.update(tenantDeployments).set({ status: "failed", lastError: posError, updatedAt: /* @__PURE__ */ new Date() }).where(eq14(tenantDeployments.tenantId, tenantId));
        return { ok: false, message: posError, cause: posError };
      }
    }
    if (licensedModules.includes("pms") && tenantId) {
      try {
        await provisionPmsStack({ slug: input.slug, tenantId, log });
      } catch (pmsErr) {
        log(
          `[provision][pms] non-fatal: ${pmsErr instanceof Error ? pmsErr.message : String(pmsErr)}`
        );
      }
    }
    if (licensedModules.includes("chat") && tenantId) {
      await provisionChatwootAccount({
        db,
        tenantId,
        tenantName: input.name,
        adminEmail: input.adminEmail,
        chatwootBaseUrl: process.env.CHATWOOT_BASE_URL ?? "",
        chatwootApiKey: process.env.CHATWOOT_API_ACCESS_TOKEN ?? "",
        log
      });
    }
    if (tenantId) {
      await db.update(tenants).set({ status: "active" }).where(eq14(tenants.id, tenantId));
      await db.update(tenantDeployments).set({ status: "active", lastError: null, updatedAt: /* @__PURE__ */ new Date() }).where(eq14(tenantDeployments.tenantId, tenantId));
    }
    log(`[provision] success slug=${input.slug} tenantId=${tenantId}`);
    return {
      ok: true,
      tenantId,
      deploymentId,
      composeProjectName: project,
      internalPort: port,
      baseUrl,
      oneTimeAdminPassword,
      financeOrganizationId,
      financeTenantId,
      financeDefaultWarehouseId,
      walkInCustomerId,
      cashAccountId,
      cardAccountId,
      posOrganizationId,
      posUrl,
      posApiUrl,
      posDefaultCredentials,
      posStatus: posOutcome.posStatus,
      tenantStatus: "active"
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (tenantId) {
      await db.update(tenants).set({ status: "failed" }).where(eq14(tenants.id, tenantId)).catch((error) => recordCleanupError("tenant_status_failed_update", error));
    }
    if (deploymentId) {
      await db.update(tenantDeployments).set({ status: "failed", lastError: message, updatedAt: /* @__PURE__ */ new Date() }).where(eq14(tenantDeployments.id, deploymentId)).catch((error) => recordCleanupError("deployment_status_failed_update", error));
    }
    if (sideEffectsStarted && composeCtx) {
      await trace.event("cleanup", "Attempting best-effort compose rollback", {
        level: "warn",
        meta: { composeProjectName: composeCtx.project }
      }).catch((error) => recordCleanupError("cleanup_event_before_rollback", error));
      const rolledBack = await composeDownBestEffort(deps.docker, composeCtx);
      if (rolledBack && tenantId) {
        await db.delete(tenants).where(eq14(tenants.id, tenantId)).catch((error) => recordCleanupError("tenant_delete_after_rollback", error));
        await trace.event("cleanup", "Compose rollback completed and tenant records removed", {
          level: "info",
          meta: { composeProjectName: composeCtx.project, tenantId }
        }).catch((error) => recordCleanupError("cleanup_event_after_rollback", error));
      } else if (!rolledBack) {
        await trace.event("cleanup", "Compose rollback failed; tenant marked failed for operator recovery", {
          level: "error",
          meta: { composeProjectName: composeCtx.project, tenantId, deploymentId }
        }).catch((error) => recordCleanupError("cleanup_event_rollback_failed", error));
      }
    }
    await trace.event("failed", message, { level: "error", meta: { cause: String(err) } }).catch((error) => recordCleanupError("final_failed_event", error));
    log(`[provision] failed slug=${input.slug} correlationId=${correlationId}: ${message}`);
    return { ok: false, message, cause: String(err) };
  }
}
async function executeAddModuleRuntime(db, input, log, correlationId) {
  const trace = createProvisionTracer(
    db,
    correlationId,
    () => ({ slug: input.slug, tenantId: input.tenantId }),
    log
  );
  const [row] = await db.select({
    tenantId: tenants.id,
    slug: tenants.slug,
    name: tenants.name,
    adminEmail: tenants.adminEmail,
    modules: tenants.modules,
    deploymentId: tenantDeployments.id,
    internalPort: tenantDeployments.internalPort,
    financeTenantId: tenantDeployments.financeTenantId,
    financeDefaultWarehouseId: tenantDeployments.financeDefaultWarehouseId,
    financeWalkInCustomerId: tenantDeployments.financeWalkInCustomerId,
    financeCashAccountId: tenantDeployments.financeCashAccountId,
    financeCardAccountId: tenantDeployments.financeCardAccountId
  }).from(tenants).innerJoin(tenantDeployments, eq14(tenantDeployments.tenantId, tenants.id)).where(eq14(tenants.id, input.tenantId)).limit(1);
  if (!row) {
    throw new Error(`tenant_not_found:${input.tenantId}`);
  }
  const licensedModules = resolveTenantModules(parseTenantModulesJson(row.modules));
  if (!licensedModules.includes(input.module)) {
    throw new Error(`module_not_on_tenant:${input.module}`);
  }
  await trace.event("add_module", `Provisioning module ${input.module}`, {
    meta: { module: input.module }
  });
  const internalApiSecret = apiConfig.internalApiSecret?.trim() ?? "";
  const financeInternalPort = row.internalPort ?? void 0;
  const internalUrl = financeInternalPort && financeInternalPort > 0 ? `http://${process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? "127.0.0.1"}:${financeInternalPort}` : void 0;
  if (input.module === "pos") {
    let financeTenantId = row.financeTenantId ?? void 0;
    let financeDefaultWarehouseId = row.financeDefaultWarehouseId ?? void 0;
    let walkInCustomerId = row.financeWalkInCustomerId ?? void 0;
    let cashAccountId = row.financeCashAccountId ?? void 0;
    let cardAccountId = row.financeCardAccountId ?? void 0;
    let serviceChargeItemId;
    let discountItemId;
    const hasAccounting = licensedModules.includes("accounting");
    if (hasAccounting && financeTenantId && internalUrl && internalApiSecret) {
      if (!financeDefaultWarehouseId || financeDefaultWarehouseId <= 0) {
        const wh = await activateFinanceWarehouses({
          internalBaseUrl: internalUrl,
          internalApiSecret,
          financeTenantId,
          correlationId,
          log
        });
        financeDefaultWarehouseId = wh.primaryWarehouseId;
        await persistFinanceDeploymentIds(db, row.deploymentId, {
          financeDefaultWarehouseId
        });
      }
      const needsDepositIds = !walkInCustomerId || walkInCustomerId <= 0 || (!cashAccountId || cashAccountId <= 0) || (!cardAccountId || cardAccountId <= 0);
      const needsBridgeItems = !serviceChargeItemId || !discountItemId;
      if (needsDepositIds || needsBridgeItems) {
        const seeded = await seedFinancePosDefaults({
          internalBaseUrl: internalUrl,
          internalApiSecret,
          financeTenantId,
          correlationId,
          log
        });
        if (needsDepositIds) {
          walkInCustomerId = seeded.walkInCustomerId;
          cashAccountId = seeded.cashAccountId;
          cardAccountId = seeded.cardAccountId;
          await persistFinanceDeploymentIds(db, row.deploymentId, {
            walkInCustomerId,
            cashAccountId,
            cardAccountId
          });
        }
        if (seeded.serviceChargeItemId) {
          serviceChargeItemId = seeded.serviceChargeItemId;
        }
        if (seeded.discountItemId) {
          discountItemId = seeded.discountItemId;
        }
      }
    }
    const posOutcome = await runPosProvisionStep({
      licensedModules,
      slug: input.slug,
      tenantId: input.tenantId,
      tenantName: input.name,
      adminEmail: input.adminEmail,
      planSlug: input.planSlug,
      financeInternalPort: financeInternalPort ?? void 0,
      db,
      log,
      trace
    });
    if (posOutcome.posStatus !== "ok") {
      const posError = posOutcome.posError ?? "POS module provisioning failed";
      await db.update(tenantDeployments).set({ lastError: posError, updatedAt: /* @__PURE__ */ new Date() }).where(eq14(tenantDeployments.tenantId, input.tenantId));
      return {
        ok: true,
        module: "pos",
        posStatus: "failed",
        posError,
        tenantStatus: hasAccounting ? "partial" : "active"
      };
    }
    if (posOutcome.posOrganizationId) {
      await db.update(tenantDeployments).set({
        posOrganizationId: posOutcome.posOrganizationId,
        ...posOutcome.posUrl ? { posUrl: posOutcome.posUrl } : {},
        lastError: null,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq14(tenantDeployments.tenantId, input.tenantId));
    }
    if (hasAccounting && posOutcome.posOrganizationId && posOutcome.posHostPort && financeTenantId && walkInCustomerId && cashAccountId && cardAccountId && financeInternalPort) {
      const wireResult = await runWirePosIntegrationStep({
        licensedModules,
        slug: input.slug,
        posOrganizationId: posOutcome.posOrganizationId,
        posHostPort: posOutcome.posHostPort,
        financeInternalPort,
        workerInternalUrl: internalUrl,
        financeTenantId,
        walkInCustomerId,
        cashAccountId,
        cardAccountId,
        serviceChargeItemId,
        discountItemId,
        financeDefaultWarehouseId,
        log,
        trace,
        markOp: async (operationKey, message, meta) => {
          await trace.event("progress", message, { meta: { operationKey, ...meta } });
        },
        hasOp: () => false
      });
      if (!wireResult.ok) {
        await markTenantPartial(db, {
          tenantId: input.tenantId,
          kind: "wire_failed",
          lastError: wireResult.error
        });
        return {
          ok: true,
          module: "pos",
          posStatus: "ok",
          posError: wireResult.error,
          tenantStatus: "partial",
          posOrganizationId: posOutcome.posOrganizationId,
          posUrl: posOutcome.posUrl,
          posApiUrl: posOutcome.posApiUrl,
          posDefaultCredentials: posOutcome.posDefaultCredentials
        };
      }
    }
    if (financeTenantId && internalUrl) {
      const planSlug = input.planSlug ?? "starter";
      const planLimits = await getPlanLimits(db, planSlug);
      await syncFinanceLicense(
        internalUrl,
        {
          tenantId: financeTenantId,
          planSlug,
          status: "active",
          isPerpetual: true,
          maxOrganizations: planLimits.maxOrganizations,
          maxActivations: planLimits.maxActivations,
          maxUsers: planLimits.maxUsers
        },
        log
      );
    }
    return {
      ok: true,
      module: "pos",
      posStatus: "ok",
      tenantStatus: "active",
      posOrganizationId: posOutcome.posOrganizationId,
      posUrl: posOutcome.posUrl,
      posApiUrl: posOutcome.posApiUrl,
      posDefaultCredentials: posOutcome.posDefaultCredentials
    };
  }
  if (input.module === "pms") {
    await provisionPmsStack({ slug: input.slug, tenantId: input.tenantId, log });
    return { ok: true, module: "pms", tenantStatus: "active" };
  }
  const chatwootBaseUrl = process.env.CHATWOOT_BASE_URL ?? "";
  const chatwootApiKey = process.env.CHATWOOT_API_ACCESS_TOKEN ?? "";
  await provisionChatwootAccount({
    db,
    tenantId: input.tenantId,
    tenantName: input.name,
    adminEmail: input.adminEmail,
    chatwootBaseUrl,
    chatwootApiKey,
    log
  });
  return { ok: true, module: "chat", tenantStatus: "active" };
}
function parseTenantModulesJson(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((m) => typeof m === "string") : [];
  } catch {
    return [];
  }
}

// ../../infra/worker-service/domain/provisioning/tenant-provision-service.ts
var TenantProvisionService = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  async provision(db, input, log, correlationId, assertNotCancelled) {
    return executeProvisionRuntime(this.deps, db, input, log, correlationId, assertNotCancelled);
  }
};

// ../../infra/worker-service/domain/provisioning/adapters/crypto-tenant-secret-generator.ts
import { createHmac as createHmac2, randomBytes as randomBytes5 } from "crypto";
var CryptoTenantSecretGenerator = class {
  persistSecret(plaintext) {
    return encryptDeploymentSecret(plaintext, apiConfig.deploymentSecretKey);
  }
  randomHex(bytes = 32) {
    return randomBytes5(bytes).toString("hex");
  }
  bootstrapAdminPassword(tenantKey) {
    const key = tenantKey.trim();
    if (key.length === 0) {
      throw new Error("bootstrapAdminPassword requires non-empty tenantKey");
    }
    const secretHex = apiConfig.deploymentSecretKey;
    const hmacKey = Buffer.from(secretHex, "hex");
    return createHmac2("sha256", hmacKey).update(`bootstrap:${key}`, "utf8").digest("base64url");
  }
};

// ../../infra/worker-service/domain/provisioning/adapters/execa-docker-compose-runner.ts
import { execa as execa4 } from "execa";
var ExecaDockerComposeRunner = class {
  async run(composeFile, project, envFile, composeEnv, args, options) {
    const execaOptions = {
      env: composeEnv,
      stdio: "pipe",
      extendEnv: true,
      forceKillAfterDelay: 500,
      timeout: options?.timeoutMs
    };
    const subprocess = execa4(
      "docker",
      ["compose", "-f", composeFile, "-p", project, "--env-file", envFile, ...args],
      execaOptions
    );
    let abortHandler;
    const cancelSignal = options?.cancelSignal;
    if (cancelSignal) {
      abortHandler = () => {
        if (process.platform === "win32" && typeof subprocess.pid === "number") {
          void execa4("taskkill", ["/PID", String(subprocess.pid), "/T", "/F"]).catch(() => void 0);
          return;
        }
        subprocess.kill("SIGKILL");
      };
      if (cancelSignal.aborted) {
        abortHandler();
      } else {
        cancelSignal.addEventListener("abort", abortHandler, { once: true });
      }
    }
    const onOutput = options?.onOutput;
    if (onOutput && subprocess.stdout) {
      subprocess.stdout.on("data", (chunk) => {
        onOutput(chunk.toString("utf8"));
      });
    }
    if (onOutput && subprocess.stderr) {
      subprocess.stderr.on("data", (chunk) => {
        onOutput(chunk.toString("utf8"));
      });
    }
    try {
      await subprocess;
    } finally {
      if (cancelSignal && abortHandler) {
        cancelSignal.removeEventListener("abort", abortHandler);
      }
    }
  }
};

// ../../infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-build-org.ts
var INITIAL_POLL_DELAY_MS = 5e3;
var POLL_INTERVAL_MS = 8e3;
var TIMEOUT_MS = 12e4;
function financeApiBase2(internalBaseUrl) {
  return internalBaseUrl.replace(/\/+$/, "");
}
function isRecord3(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function readString3(v) {
  return typeof v === "string" && v.length > 0 ? v : void 0;
}
function parseSigninToken2(body) {
  if (!isRecord3(body)) return null;
  const accessToken = readString3(body.accessToken) ?? readString3(body.access_token) ?? readString3(body.token);
  const organizationId = readString3(body.organizationId) ?? readString3(body.organization_id);
  if (!accessToken || !organizationId) return null;
  return { accessToken, organizationId };
}
function isTenantAlreadyBuilt(rawText, json) {
  if (rawText.includes("TENANT_ALREADY_BUILT")) return true;
  if (!isRecord3(json)) return false;
  const errors = json.errors;
  if (!Array.isArray(errors)) return false;
  const first = errors[0];
  if (!isRecord3(first)) return false;
  return first.type === "TENANT_ALREADY_BUILT";
}
function parseBuildJobId(json) {
  if (!isRecord3(json)) return null;
  const data = json.data;
  if (!isRecord3(data)) return null;
  const id = data.jobId ?? data.job_id;
  if (typeof id === "string") return id;
  if (typeof id === "number") return String(id);
  return null;
}
function jobFinished(body) {
  if (!isRecord3(body)) return "running";
  if (body.isFailed === true || body.is_failed === true) return "failed";
  if (body.isCompleted === true || body.is_completed === true) return "completed";
  const state = readString3(body.state);
  if (state === "failed") return "failed";
  if (state === "completed") return "completed";
  return "running";
}
async function sleep2(ms) {
  await new Promise((r) => setTimeout(r, ms));
}
async function signin(base, email, password, correlationId) {
  const res = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": correlationId,
      "x-correlation-id": correlationId
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(1e4)
  });
  let json;
  try {
    json = normalizeFinanceApiJson(await res.json());
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return parseSigninToken2(json);
}
async function currentHasBuiltAt(base, accessToken, organizationId, correlationId) {
  const res = await fetch(`${base}/api/organization/current`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "organization-id": organizationId,
      "x-request-id": correlationId,
      "x-correlation-id": correlationId
    },
    signal: AbortSignal.timeout(1e4)
  });
  if (!res.ok) return false;
  let json;
  try {
    json = normalizeFinanceApiJson(await res.json());
  } catch {
    return false;
  }
  if (!isRecord3(json)) return false;
  const builtAt = json.builtAt;
  return builtAt !== null && builtAt !== void 0 && builtAt !== "";
}
async function fetchBuildOrganization(input, log) {
  const base = financeApiBase2(input.internalBaseUrl);
  const creds = input.session ?? await signin(base, input.adminEmail, input.adminPassword, input.correlationId);
  if (!creds) {
    return { ok: false, error: "signin_failed" };
  }
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${creds.accessToken}`,
    "organization-id": creds.organizationId,
    "x-request-id": input.correlationId,
    "x-correlation-id": input.correlationId
  };
  if (await currentHasBuiltAt(base, creds.accessToken, creds.organizationId, input.correlationId)) {
    log("Organization already built, skipping");
    return { ok: true, alreadyBuilt: true, financeOrganizationId: creds.organizationId };
  }
  const buildBody = {
    name: input.settings.name,
    location: input.settings.location,
    baseCurrency: input.settings.baseCurrency,
    timezone: input.settings.timezone,
    fiscalYear: normalizeFiscalYearForFinanceBuild(input.settings.fiscalYear),
    language: normalizeLanguageForFinanceBuild(input.settings.language),
    ...input.settings.dateFormat ? { dateFormat: normalizeDateFormatForFinanceBuild(input.settings.dateFormat) } : {}
  };
  const buildRes = await fetch(`${base}/api/organization/build`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(buildBody),
    signal: AbortSignal.timeout(1e4)
  });
  const buildText = await buildRes.text();
  const buildJson = buildText ? normalizeFinanceApiJson(JSON.parse(buildText)) : {};
  if (!buildRes.ok) {
    if (isTenantAlreadyBuilt(buildText, buildJson)) {
      log("Organization already built (TENANT_ALREADY_BUILT), treating as success");
      return { ok: true, alreadyBuilt: true, financeOrganizationId: creds.organizationId };
    }
    return {
      ok: false,
      error: `organization_build_http_${buildRes.status}: ${buildText.slice(0, 500)}`
    };
  }
  const jobId = parseBuildJobId(buildJson);
  const deadline = Date.now() + TIMEOUT_MS;
  if (jobId) {
    log(`[build] polling organization build job id=${jobId}`);
    await sleep2(INITIAL_POLL_DELAY_MS);
    while (Date.now() < deadline) {
      const jobRes = await fetch(`${base}/api/organization/build/${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: authHeaders,
        signal: AbortSignal.timeout(1e4)
      });
      let jobJson;
      try {
        jobJson = normalizeFinanceApiJson(await jobRes.json());
      } catch {
        jobJson = {};
      }
      if (!jobRes.ok) {
        return { ok: false, error: `build_job_poll_http_${jobRes.status}` };
      }
      const done = jobFinished(jobJson);
      if (done === "failed") {
        return { ok: false, error: "organization_build_job_failed" };
      }
      if (done === "completed") {
        break;
      }
      await sleep2(POLL_INTERVAL_MS);
    }
  } else {
    log("[build] no job id in response; polling /organization/current for builtAt");
    await sleep2(INITIAL_POLL_DELAY_MS);
    while (Date.now() < deadline) {
      if (await currentHasBuiltAt(base, creds.accessToken, creds.organizationId, input.correlationId)) {
        break;
      }
      await sleep2(POLL_INTERVAL_MS);
    }
  }
  if (!await currentHasBuiltAt(base, creds.accessToken, creds.organizationId, input.correlationId)) {
    throw new Error("organization_build_timeout: builtAt not set within 120s");
  }
  return { ok: true, financeOrganizationId: creds.organizationId };
}

// ../../infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-bootstrap.ts
function financeApiBase3(internalBaseUrl) {
  return internalBaseUrl.replace(/\/+$/, "");
}
var FetchStockixFinanceBootstrap = class {
  async waitUntilReady(internalBaseUrl, timeoutMs, log, requestId, trace) {
    const url = `${financeApiBase3(internalBaseUrl)}/api/ping`;
    const started = Date.now();
    const deadline = started + timeoutMs;
    let lastError = "";
    while (Date.now() < deadline) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(5e3),
          headers: requestId ? {
            "x-request-id": requestId,
            "x-correlation-id": requestId
          } : void 0
        });
        if (res.ok) {
          log(`stockix finance healthy at ${url}`);
          await trace?.event("health", "Stockix Finance /api/ping is healthy", {
            meta: { url, pollMs: STOCKIX_FINANCE_HEALTH_POLL_MS }
          });
          return;
        }
        lastError = `HTTP ${res.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, STOCKIX_FINANCE_HEALTH_POLL_MS));
    }
    throw new Error(
      `Stockix Finance did not become ready within ${timeoutMs}ms (last error: ${lastError || "unknown"})`
    );
  }
  async registerBootstrapAdmin(params) {
    const url = `${financeApiBase3(params.internalBaseUrl)}/api/internal/provision-user`;
    const maxAttempts = 3;
    const requestTimeoutMs2 = 1e4;
    let lastFailure = "unknown";
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptStartedAt = Date.now();
      await params.trace?.event("bootstrap", "Bootstrap registration attempt", {
        meta: {
          url,
          attempt,
          maxAttempts
        }
      });
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": params.internalApiSecret,
            ...params.requestId ? {
              "x-request-id": params.requestId,
              "x-correlation-id": params.requestId
            } : {}
          },
          body: JSON.stringify({
            first_name: params.firstName,
            last_name: params.lastName,
            email: params.email,
            password: params.password,
            role: "admin",
            ...params.organizationNumber ? { organizationNumber: params.organizationNumber } : {}
          }),
          signal: AbortSignal.timeout(requestTimeoutMs2)
        });
        if (res.ok) {
          const text3 = await res.text();
          const json = parseFinanceApiJsonText(text3);
          const tenantId = Number(json.tenantId);
          const organizationId = String(json.organizationId ?? "");
          if (!tenantId || !organizationId) {
            lastFailure = "provision_user_missing_tenant_or_organization_id";
          } else {
            await params.trace?.event("bootstrap", "Bootstrap registration succeeded", {
              meta: {
                url,
                attempt,
                elapsedMs: Date.now() - attemptStartedAt,
                tenantId,
                organizationId
              }
            });
            return { tenantId, organizationId };
          }
        }
        const text2 = await res.text();
        lastFailure = `HTTP ${res.status} ${text2.slice(0, 500)}`;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }
      await params.trace?.event("bootstrap", "Bootstrap registration attempt failed", {
        level: "warn",
        meta: {
          url,
          attempt,
          maxAttempts,
          elapsedMs: Date.now() - attemptStartedAt,
          error: lastFailure
        }
      });
      if (attempt < maxAttempts) {
        const backoffMs = Math.min(5e3, attempt * 1500);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
    throw new Error(`register failed: ${lastFailure} url=${url}`);
  }
  fetchOrgSettings(params) {
    return fetchOrgSettingsFromMainInstance(params);
  }
  buildOrganization(input, log) {
    return fetchBuildOrganization(input, log);
  }
};

// ../../infra/worker-service/domain/provisioning/adapters/traefik-edge-publisher.ts
var TraefikEdgePublisher = class {
  async publish(slug, port, rootDomain) {
    await writeTenantTraefikConfig(slug, port, rootDomain);
  }
  async unpublish(slug) {
    await removeTenantTraefikConfig(slug);
  }
};

// ../../infra/worker-service/domain/provisioner.ts
var dockerRunner = new ExecaDockerComposeRunner();
var edgePublisher = new TraefikEdgePublisher();
var tenantProvisionService = new TenantProvisionService({
  docker: dockerRunner,
  secrets: new CryptoTenantSecretGenerator(),
  finance: new FetchStockixFinanceBootstrap(),
  edge: edgePublisher
});
async function provisionTenant(db, input, log, correlationId, assertNotCancelled) {
  return tenantProvisionService.provision(db, input, log, correlationId, assertNotCancelled);
}
async function deprovisionTenant(db, tenantId, options = {}) {
  const log = options.log ?? (() => void 0);
  const found = await db.select({ id: tenants.id, slug: tenants.slug, composeProject: tenantDeployments.composeProjectName }).from(tenants).leftJoin(tenantDeployments, eq15(tenantDeployments.tenantId, tenants.id)).where(eq15(tenants.id, tenantId)).limit(1);
  const row = found[0];
  if (!row) return { ok: false, message: "Tenant not found" };
  const project = row.composeProject ?? composeProjectName(row.slug);
  const { tenantComposeFile: composeFile, stockixFinanceRoot } = getTenantStackPaths();
  const envPath = join8(defaultTenantEnvRoot(), row.slug, ".env");
  const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot, COMPOSE_PROJECT_NAME: project };
  let dockerStatus = "skipped";
  try {
    await stat(envPath);
    const downArgs = ["down", "--remove-orphans", "--timeout", "30"];
    if (options.removeVolumes) {
      downArgs.push("-v");
    }
    if (options.removeImages) {
      downArgs.push("--rmi", "local");
    }
    await dockerRunner.run(composeFile, project, envPath, composeEnv, downArgs, { timeoutMs: 2 * 60 * 1e3 });
    dockerStatus = "stopped";
  } catch {
    dockerStatus = "skipped";
  }
  await edgePublisher.unpublish(row.slug).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    log(`edge unpublish failed for ${row.slug}: ${message}`);
  });
  await removePosTraefikConfig(row.slug).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    log(`pos edge unpublish failed for ${row.slug}: ${message}`);
  });
  await db.delete(tenantProvisionEvents).where(eq15(tenantProvisionEvents.tenantId, tenantId));
  await db.delete(adminAuditLog).where(eq15(adminAuditLog.targetTenantId, tenantId));
  await db.delete(tenantDeployments).where(eq15(tenantDeployments.tenantId, tenantId));
  await db.delete(tenants).where(eq15(tenants.id, tenantId));
  await rm(join8(defaultTenantEnvRoot(), row.slug), { recursive: true, force: true }).catch(() => void 0);
  log(`deprovision done for ${project}`);
  return { ok: true, slug: row.slug, composeProject: project, docker: dockerStatus };
}

// ../../infra/worker-service/src/org-provision-runtime.ts
function financeApiBase4(internalBaseUrl) {
  return internalBaseUrl.replace(/\/+$/, "");
}
function isRecord4(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function readString4(v) {
  return typeof v === "string" && v.length > 0 ? v : void 0;
}
function parseAuthSession(body) {
  if (!isRecord4(body)) return null;
  const accessToken = readString4(body.accessToken) ?? readString4(body.access_token) ?? readString4(body.token);
  const organizationId = readString4(body.organizationId) ?? readString4(body.organization_id);
  const tenantIdRaw = isRecord4(body) ? body.tenantId ?? body.tenant_id : null;
  const tenantId = Number(tenantIdRaw);
  if (!accessToken || !organizationId) return null;
  return {
    accessToken,
    organizationId,
    tenantId: Number.isFinite(tenantId) && tenantId > 0 ? tenantId : null
  };
}
function parseSignupOrganizationId(body) {
  if (!isRecord4(body)) return null;
  return readString4(body.organizationId) ?? readString4(body.organization_id) ?? null;
}
async function registerNewFinanceOrg(base, params) {
  const res = await fetch(`${base}/api/internal/provision-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": params.internalApiSecret,
      "x-request-id": params.correlationId,
      "x-correlation-id": params.correlationId
    },
    body: JSON.stringify({
      first_name: params.firstName,
      last_name: params.lastName,
      email: params.email,
      password: params.password,
      role: "admin"
    }),
    signal: AbortSignal.timeout(1e4)
  });
  const text2 = await res.text();
  if (!res.ok) {
    throw new Error(`register_failed_http_${res.status}: ${text2.slice(0, 500)}`);
  }
  const json = parseFinanceApiJsonText(text2);
  const organizationId = parseSignupOrganizationId(json);
  const tenantId = Number(json.tenantId);
  if (!organizationId || !tenantId) {
    throw new Error("register_missing_organization_or_tenant_id");
  }
  return { organizationId, tenantId };
}
async function signin2(base, email, password, correlationId) {
  const res = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": correlationId,
      "x-correlation-id": correlationId
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(1e4)
  });
  const text2 = await res.text();
  if (!res.ok) {
    throw new Error(`signin_failed_http_${res.status}: ${text2.slice(0, 500)}`);
  }
  const session = parseAuthSession(
    text2 ? normalizeFinanceApiJson(JSON.parse(text2)) : {}
  );
  if (!session) {
    throw new Error("signin_missing_token");
  }
  return session;
}
async function switchTenant(base, accessToken, organizationId, correlationId) {
  const res = await fetch(`${base}/api/auth/switch-tenant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "x-request-id": correlationId,
      "x-correlation-id": correlationId
    },
    body: JSON.stringify({ organizationId }),
    signal: AbortSignal.timeout(1e4)
  });
  const text2 = await res.text();
  if (!res.ok) {
    throw new Error(`switch_tenant_failed_http_${res.status}: ${text2.slice(0, 500)}`);
  }
  const session = parseAuthSession(
    text2 ? normalizeFinanceApiJson(JSON.parse(text2)) : {}
  );
  if (!session) {
    throw new Error("switch_tenant_missing_token");
  }
  return session;
}
async function patchControlPlaneOrganization(controlPlaneOrgId, patch, log) {
  const apiBase = `http://localhost:${apiConfig.port}`;
  const saveUrl = `${apiBase}/internal/organizations/${controlPlaneOrgId}`;
  const secret = apiConfig.workerSecret;
  const saveRes = await fetch(saveUrl, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...secret ? { Authorization: `Bearer ${secret}` } : {}
    },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(1e4)
  });
  if (!saveRes.ok) {
    throw new Error(`patch_control_plane_org_http_${saveRes.status}`);
  }
  log("[org-provision] Updated control-plane organization");
}
async function saveFinanceOrganizationId(controlPlaneOrgId, financeOrganizationId, log) {
  await patchControlPlaneOrganization(
    controlPlaneOrgId,
    { financeOrganizationId, provisioningError: null },
    log
  );
}
async function attachAdminToOrg(mainBase, adminEmail, financeOrganizationId, log) {
  const internalSecret = apiConfig.internalApiSecret;
  if (!internalSecret) {
    log("[org-provision] Warning: INTERNAL_API_SECRET not configured; skipping attach-user");
    return;
  }
  const attachUrl = `${mainBase}/api/internal/attach-user-to-tenant`;
  const attachRes = await fetch(attachUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret
    },
    body: JSON.stringify({
      email: adminEmail,
      organization_id: financeOrganizationId
    }),
    signal: AbortSignal.timeout(1e4)
  });
  if (!attachRes.ok) {
    log(`[org-provision] Warning: attach-user failed ${attachRes.status}`);
    return;
  }
  log("[org-provision] Admin user attached to org");
}
async function executeOrgProvisionRuntime(db, input, log, assertNotCancelled) {
  const secrets = new CryptoTenantSecretGenerator();
  const mainBase = financeApiBase4(input.mainTenantInternalBaseUrl);
  const adminPassword = secrets.bootstrapAdminPassword(input.parentTenantSlug.trim());
  const correlationId = input.correlationId;
  const check = async () => {
    if (assertNotCancelled) await assertNotCancelled();
  };
  const internalApiSecret = apiConfig.internalApiSecret;
  if (!internalApiSecret) {
    throw new Error(
      "INTERNAL_API_SECRET is required for org provisioning user creation"
    );
  }
  await check();
  log("[org-provision] Registering new Finance org on parent stack");
  const registered = await registerNewFinanceOrg(mainBase, {
    firstName: input.adminFirstName,
    lastName: input.adminLastName,
    email: input.adminEmail,
    password: adminPassword,
    correlationId,
    internalApiSecret
  });
  await check();
  log("[org-provision] Signing in and switching to new org");
  const newFinanceOrganizationId = registered.organizationId;
  const newFinanceTenantId = registered.tenantId;
  const signinSession = await signin2(mainBase, input.adminEmail, adminPassword, correlationId);
  const buildSession = await switchTenant(
    mainBase,
    signinSession.accessToken,
    newFinanceOrganizationId,
    correlationId
  );
  let inheritedSettings = {
    ...MENA_DEFAULTS,
    name: input.orgName
  };
  try {
    const fetched = await fetchOrgSettingsFromMainInstance({
      mainInternalBaseUrl: mainBase,
      adminEmail: input.adminEmail,
      adminPassword,
      correlationId
    });
    if (fetched) {
      inheritedSettings = { ...fetched, name: input.orgName };
      log("[org-provision] Using inherited settings from main org");
    }
  } catch (err) {
    log(
      `[org-provision] Settings fetch failed, using defaults: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  await check();
  log("[org-provision] Building organization database");
  const buildResult = await fetchBuildOrganization(
    {
      internalBaseUrl: mainBase,
      adminEmail: input.adminEmail,
      adminPassword,
      settings: inheritedSettings,
      correlationId,
      session: buildSession
    },
    log
  );
  if (!buildResult.ok) {
    throw new Error(buildResult.error ?? "organization_build_failed");
  }
  const financeOrganizationId = buildResult.financeOrganizationId ?? buildSession.organizationId;
  await check();
  await attachAdminToOrg(mainBase, input.adminEmail, financeOrganizationId, log);
  await check();
  await saveFinanceOrganizationId(input.organizationId, financeOrganizationId, log);
  if (apiConfig.internalApiSecret) {
    await check();
    log("[org-provision] Activating primary warehouse");
    await activateFinanceWarehouses({
      internalBaseUrl: mainBase,
      internalApiSecret: apiConfig.internalApiSecret,
      financeTenantId: newFinanceTenantId,
      correlationId,
      log
    });
  }
  const parentFinanceTenantId = signinSession.tenantId ?? await resolveParentFinanceTenantId2(
    mainBase,
    signinSession.organizationId,
    correlationId
  );
  if (parentFinanceTenantId && apiConfig.internalApiSecret) {
    try {
      const copyUrl = `${mainBase}/api/internal/tenants/${newFinanceTenantId}/copy-from/${parentFinanceTenantId}`;
      const copyRes = await fetch(copyUrl, {
        method: "POST",
        headers: {
          "x-internal-secret": apiConfig.internalApiSecret,
          "x-request-id": correlationId
        },
        signal: AbortSignal.timeout(6e4)
      });
      const copyText = await copyRes.text();
      log(
        `[org-provision] COA copy ${copyRes.ok ? "ok" : "failed"}: ${copyText.slice(0, 200)}`
      );
      if (!copyRes.ok) {
        await patchControlPlaneOrganization(
          input.organizationId,
          {
            provisioningError: `coa_copy_failed: ${copyText.slice(0, 500)}`
          },
          log
        );
      }
      const parentUrl = `${mainBase}/api/internal/tenants/${newFinanceTenantId}/set-parent`;
      await fetch(parentUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": apiConfig.internalApiSecret
        },
        body: JSON.stringify({ parentTenantId: parentFinanceTenantId }),
        signal: AbortSignal.timeout(1e4)
      });
    } catch (err) {
      log(
        `[org-provision] COA copy error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  await check();
  log("[org-provision] Syncing Finance license limits for sub-organization");
  await syncFinanceLicenseForStockixTenant(
    db,
    {
      stockixTenantId: input.stockixTenantId,
      financeTenantId: newFinanceTenantId,
      internalBaseUrl: mainBase
    },
    log
  );
}
async function resolveParentFinanceTenantId2(mainBase, organizationId, correlationId) {
  const signinRes = await fetch(`${mainBase}/api/organization/current`, {
    headers: {
      "organization-id": organizationId,
      "x-request-id": correlationId
    },
    signal: AbortSignal.timeout(1e4)
  }).catch(() => null);
  if (!signinRes?.ok) return 1;
  const body = await signinRes.json().catch(() => ({}));
  const tenantId = Number(body.id ?? body.tenant_id);
  return Number.isFinite(tenantId) && tenantId > 0 ? tenantId : 1;
}

// ../../infra/worker-service/src/worker.ts
var workerId = `infra-worker-${randomUUID()}`;
var pollMs = 1500;
var LICENSE_EXPIRE_SCAN_INTERVAL_MS = 5 * 60 * 1e3;
var lastLicenseExpireScanMs = 0;
async function expireDueLicenses(db) {
  const now = /* @__PURE__ */ new Date();
  const justExpired = await db.update(licenses).set({ status: "expired", updatedAt: now }).where(
    and4(
      eq16(licenses.status, "active"),
      eq16(licenses.isPerpetual, false),
      isNotNull2(licenses.expiresAt),
      lte2(licenses.expiresAt, now)
    )
  ).returning({
    id: licenses.id,
    tenantId: licenses.tenantId,
    expiresAt: licenses.expiresAt,
    gracePeriodDays: licenses.gracePeriodDays
  });
  await processLicenseExpiryFollowUp(db, {
    justExpired,
    now,
    log: (message) => console.log(message)
  });
}
var apiHost = process.env.API_HOST?.trim() || "127.0.0.1";
var apiBaseUrl = `http://${apiHost}:${apiConfig.port}`;
var requestTimeoutMs = 1e4;
var jobExecutionTimeoutMs = apiConfig.workerJobExecutionTimeoutMs;
var heartbeatIntervalMs = 15e3;
var apiReadyMaxWaitMs = 18e4;
var apiUnreachableLogIntervalMs = 3e4;
var shuttingDown = false;
var lastApiUnreachableLogMs = 0;
function runtimeBundleMtime() {
  try {
    const bundlePath = join9(dirname2(fileURLToPath3(import.meta.url)), "worker.js");
    return statSync(bundlePath).mtime.toISOString();
  } catch {
    return null;
  }
}
var runtimeFingerprint = {
  workerId,
  startedAt: (/* @__PURE__ */ new Date()).toISOString(),
  entrypoint: import.meta.url,
  runtimeBundleMtime: runtimeBundleMtime(),
  nodeVersion: process.version
};
function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}
function isApiConnectionError(error) {
  if (!(error instanceof Error)) return false;
  if (error.message === "fetch failed") return true;
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = cause.code;
    return code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN";
  }
  return false;
}
async function waitForApiReady() {
  const healthUrl = `${apiBaseUrl}/health`;
  const started = Date.now();
  console.log(
    JSON.stringify({
      level: "info",
      type: "worker_waiting_for_api",
      healthUrl,
      maxWaitMs: apiReadyMaxWaitMs
    })
  );
  while (!shuttingDown && Date.now() - started < apiReadyMaxWaitMs) {
    try {
      const res = await fetch(healthUrl, { signal: timeoutSignal(5e3) });
      if (res.ok) {
        console.log(JSON.stringify({ level: "info", type: "worker_api_ready", healthUrl }));
        return;
      }
    } catch {
    }
    await new Promise((r) => setTimeout(r, 1e3));
  }
  throw new Error(`api_not_ready:${healthUrl}`);
}
function logApiUnreachable() {
  const now = Date.now();
  if (now - lastApiUnreachableLogMs < apiUnreachableLogIntervalMs) return;
  lastApiUnreachableLogMs = now;
  console.warn(
    `[worker] API unreachable at ${apiBaseUrl} (is \`api\` dev running?). Will retry job claims.`
  );
}
async function withExecutionTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`execution_timeout:${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function emitWorkerMetric(name, value, tags) {
  const endpoint = apiConfig.metricsEndpoint;
  if (!endpoint) return;
  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...apiConfig.metricsAuthToken ? { Authorization: `Bearer ${apiConfig.metricsAuthToken}` } : {}
    },
    body: JSON.stringify({
      source: "worker",
      workerId,
      name,
      value,
      tags,
      ts: (/* @__PURE__ */ new Date()).toISOString()
    }),
    signal: timeoutSignal(requestTimeoutMs)
  }).catch((error) => {
    console.error(
      `[worker] metric emit failed: ${error instanceof Error ? error.message : String(error)}`
    );
  });
}
async function claimNextJob() {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...secret ? { Authorization: `Bearer ${secret}` } : {}
    },
    body: JSON.stringify({ workerId }),
    signal: timeoutSignal(requestTimeoutMs)
  });
  if (!res.ok) throw new Error(`claim_failed:${res.status}`);
  const body = await res.json();
  return body.job ?? null;
}
async function markJobComplete(jobId, opts) {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const completionBody = { workerId };
  if (opts?.oneTimeAdminPassword !== void 0) {
    completionBody.oneTimeAdminPassword = opts.oneTimeAdminPassword;
  }
  const resultPayload = {};
  if (opts?.financeOrganizationId) {
    resultPayload.financeOrganizationId = opts.financeOrganizationId;
  }
  if (opts?.financeTenantId !== void 0) {
    resultPayload.financeTenantId = opts.financeTenantId;
  }
  if (opts?.financeDefaultWarehouseId !== void 0) {
    resultPayload.financeDefaultWarehouseId = opts.financeDefaultWarehouseId;
  }
  if (opts?.posStatus) {
    resultPayload.posStatus = opts.posStatus;
  }
  if (opts?.posError) {
    resultPayload.posError = opts.posError;
  }
  if (opts?.tenantStatus) {
    resultPayload.tenantStatus = opts.tenantStatus;
  }
  if (opts?.walkInCustomerId !== void 0) {
    resultPayload.walkInCustomerId = opts.walkInCustomerId;
  }
  if (opts?.cashAccountId !== void 0) {
    resultPayload.cashAccountId = opts.cashAccountId;
  }
  if (opts?.cardAccountId !== void 0) {
    resultPayload.cardAccountId = opts.cardAccountId;
  }
  if (opts?.posOrganizationId) {
    resultPayload.posOrganizationId = opts.posOrganizationId;
  }
  if (opts?.posUrl) {
    resultPayload.posUrl = opts.posUrl;
  }
  if (opts?.posApiUrl) {
    resultPayload.posApiUrl = opts.posApiUrl;
  }
  if (Object.keys(resultPayload).length > 0) {
    completionBody.result = resultPayload;
  }
  if (opts?.posDefaultCredentials) {
    completionBody.posDefaultCredentials = opts.posDefaultCredentials;
  }
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...secret ? { Authorization: `Bearer ${secret}` } : {}
    },
    body: JSON.stringify(completionBody),
    signal: timeoutSignal(requestTimeoutMs)
  });
  if (!res.ok) throw new Error(`complete_failed:${res.status}`);
}
async function markJobHeartbeat(jobId) {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...secret ? { Authorization: `Bearer ${secret}` } : {}
    },
    body: JSON.stringify({ workerId }),
    signal: timeoutSignal(requestTimeoutMs)
  });
  if (!res.ok) throw new Error(`heartbeat_failed:${res.status}`);
}
async function markJobFailure(jobId, message, noRetry = false) {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/fail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...secret ? { Authorization: `Bearer ${secret}` } : {}
    },
    body: JSON.stringify({ error: message, workerId, noRetry }),
    signal: timeoutSignal(requestTimeoutMs)
  });
  if (!res.ok) throw new Error(`fail_failed:${res.status}`);
}
function startJobHeartbeatLoop(jobId) {
  const timer = setInterval(() => {
    void markJobHeartbeat(jobId).catch((error) => {
      console.error(
        `[worker][${jobId}] heartbeat failed: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }, heartbeatIntervalMs);
  return () => clearInterval(timer);
}
async function assertProvisionNotCancelled(jobId) {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/cancel-check`, {
    method: "GET",
    headers: {
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...secret ? { Authorization: `Bearer ${secret}` } : {}
    },
    signal: timeoutSignal(requestTimeoutMs)
  });
  if (!res.ok) {
    throw new Error(`cancel_check_failed:${res.status}`);
  }
  const body = await res.json();
  if (body.cancelled) {
    throw new Error(`cancelled_by_user: ${body.reason ?? "cancelled"}`);
  }
}
var ALLOWED_LIFECYCLE_COMMANDS = ["start", "stop"];
var provisionPayloadSchema = z2.object({
  slug: z2.string().min(1),
  name: z2.string().min(1),
  ownerId: z2.string().uuid(),
  adminEmail: z2.string().email(),
  adminFirstName: z2.string().min(1),
  adminLastName: z2.string().min(1),
  planSlug: z2.string().optional(),
  modules: z2.array(z2.enum(["accounting", "pos", "pms", "chat"])).optional(),
  organizationId: z2.string().uuid().optional(),
  stockixTenantId: z2.string().uuid().optional(),
  stockixApiUrl: z2.string().optional(),
  parentTenantSlug: z2.string().optional(),
  mainTenantInternalBaseUrl: z2.string().optional(),
  retryModules: z2.array(z2.enum(["accounting", "pos", "pms", "chat", "wire"])).optional()
});
var orgProvisionPayloadSchema = z2.object({
  organizationId: z2.string().uuid(),
  adminEmail: z2.string().email(),
  adminFirstName: z2.string().min(1),
  adminLastName: z2.string().min(1),
  orgName: z2.string().min(1),
  parentTenantSlug: z2.string().min(1),
  mainTenantInternalBaseUrl: z2.string().min(1),
  stockixTenantId: z2.string().uuid(),
  stockixApiUrl: z2.string().optional()
});
var addModulePayloadSchema = z2.object({
  tenantId: z2.string().uuid(),
  slug: z2.string().min(1),
  name: z2.string().min(1),
  adminEmail: z2.string().email(),
  planSlug: z2.string().optional(),
  module: z2.enum(["pos", "pms", "chat"])
});
var removeModulePayloadSchema = z2.object({
  slug: z2.string().min(1),
  module: z2.enum(["pos", "pms", "chat"])
});
async function runProvisionJob(db, job) {
  const guard = async () => {
    await assertProvisionNotCancelled(job.id);
  };
  await guard();
  const payload = provisionPayloadSchema.parse(job.payload);
  const result = await provisionTenant(
    db,
    {
      slug: payload.slug,
      name: payload.name,
      ownerId: payload.ownerId,
      adminEmail: payload.adminEmail,
      adminFirstName: payload.adminFirstName,
      adminLastName: payload.adminLastName,
      planSlug: payload.planSlug,
      modules: payload.modules,
      stockixTenantId: payload.stockixTenantId,
      stockixApiUrl: payload.stockixApiUrl,
      parentTenantSlug: payload.parentTenantSlug,
      mainTenantInternalBaseUrl: payload.mainTenantInternalBaseUrl,
      controlPlaneOrgId: payload.organizationId ?? void 0,
      retryModules: payload.retryModules
    },
    (m) => console.log(`[worker][${job.id}] ${m}`),
    job.correlationId ?? randomUUID(),
    guard
  );
  if (!result.ok) {
    throw new Error(result.message);
  }
  await db.insert(adminAuditLog).values({
    actorId: String(payload.ownerId ?? ""),
    action: "tenant.create",
    targetTenantId: result.tenantId,
    ipAddress: workerId,
    userAgent: "infra-worker",
    metadata: { mode: "job_worker", jobId: job.id }
  }).catch(async (error) => {
    if (job.correlationId) {
      await db.insert(tenantProvisionEvents).values({
        correlationId: job.correlationId,
        phase: "audit",
        level: "error",
        message: "Failed to write admin audit log after successful provision",
        tenantId: result.tenantId,
        meta: {
          step: "admin_audit_log",
          error: error instanceof Error ? error.message : String(error),
          jobId: job.id
        }
      }).catch((nestedError) => {
        console.error(
          `[worker][${job.id}] failed to persist audit failure event: ${nestedError instanceof Error ? nestedError.message : String(nestedError)}`
        );
      });
    }
  });
  return {
    oneTimeAdminPassword: result.oneTimeAdminPassword,
    financeOrganizationId: result.financeOrganizationId,
    financeTenantId: result.financeTenantId,
    financeDefaultWarehouseId: result.financeDefaultWarehouseId,
    posStatus: result.posStatus,
    posError: result.posError,
    tenantStatus: result.tenantStatus,
    walkInCustomerId: result.walkInCustomerId,
    cashAccountId: result.cashAccountId,
    cardAccountId: result.cardAccountId,
    posOrganizationId: result.posOrganizationId,
    posUrl: result.posUrl,
    posApiUrl: result.posApiUrl,
    posDefaultCredentials: result.posDefaultCredentials
  };
}
async function runOrgProvisionJob(db, job) {
  const guard = async () => {
    await assertProvisionNotCancelled(job.id);
  };
  await guard();
  const payload = orgProvisionPayloadSchema.parse(job.payload);
  await executeOrgProvisionRuntime(
    db,
    {
      organizationId: payload.organizationId,
      adminEmail: payload.adminEmail,
      adminFirstName: payload.adminFirstName,
      adminLastName: payload.adminLastName,
      orgName: payload.orgName,
      mainTenantInternalBaseUrl: payload.mainTenantInternalBaseUrl,
      parentTenantSlug: payload.parentTenantSlug,
      stockixTenantId: payload.stockixTenantId,
      correlationId: job.correlationId ?? randomUUID()
    },
    (m) => console.log(`[worker][${job.id}] ${m}`),
    guard
  );
}
async function runAddModuleJob(db, job) {
  const payload = addModulePayloadSchema.parse(job.payload);
  const result = await executeAddModuleRuntime(
    db,
    {
      tenantId: payload.tenantId,
      slug: payload.slug,
      name: payload.name,
      adminEmail: payload.adminEmail,
      module: payload.module,
      planSlug: payload.planSlug
    },
    (m) => console.log(`[worker][${job.id}] ${m}`),
    job.correlationId ?? randomUUID()
  );
  return {
    tenantStatus: result.tenantStatus,
    posStatus: result.posStatus,
    posError: result.posError,
    posOrganizationId: result.posOrganizationId,
    posUrl: result.posUrl,
    posApiUrl: result.posApiUrl,
    posDefaultCredentials: result.posDefaultCredentials
  };
}
async function runRemoveModuleJob(job) {
  const payload = removeModulePayloadSchema.parse(job.payload);
  if (payload.module === "pos" || payload.module === "pms") {
    await stopModuleStack(
      payload.slug,
      payload.module,
      (m) => console.log(`[worker][${job.id}] ${m}`)
    );
  }
}
async function runDeprovisionJob(db, job) {
  if (!job.tenantId) throw new Error("tenantId is required");
  const removeVolumes = job.payload.removeVolumes === true;
  const removeImages = job.payload.removeImages === true;
  const result = await deprovisionTenant(db, job.tenantId, {
    removeVolumes,
    removeImages,
    log: (m) => console.log(`[worker][${job.id}] ${m}`)
  });
  if (!result.ok) throw new Error(result.message);
}
async function runTenantLifecycleCommand(db, job, command) {
  if (!job.tenantId) throw new Error("tenantId is required");
  const rows = await db.select({
    tenantId: tenants.id,
    slug: tenants.slug,
    composeProjectName: tenantDeployments.composeProjectName
  }).from(tenants).leftJoin(tenantDeployments, eq16(tenantDeployments.tenantId, tenants.id)).where(eq16(tenants.id, job.tenantId)).limit(1);
  const row = rows[0];
  if (!row || !row.composeProjectName) {
    throw new Error("tenant_not_found");
  }
  await execa5("docker", ["compose", "-p", row.composeProjectName, command], {
    timeout: 6e4
  });
}
var handlers = {
  "tenant.provision": runProvisionJob,
  "organization.provision": runOrgProvisionJob,
  "tenant.deprovision": runDeprovisionJob,
  add_module: runAddModuleJob,
  remove_module: (_db, job) => runRemoveModuleJob(job),
  "tenant.lifecycle": (db, job) => {
    const rawCommand = String(job.payload.command ?? "");
    if (!ALLOWED_LIFECYCLE_COMMANDS.includes(rawCommand)) {
      throw new Error(`Invalid lifecycle command: "${rawCommand}". Allowed: ${ALLOWED_LIFECYCLE_COMMANDS.join(", ")}`);
    }
    const command = rawCommand;
    return runTenantLifecycleCommand(db, job, command);
  }
};
function isPermanentProvisionError(message) {
  const lowered = message.toLowerCase();
  return message.startsWith("tenant_slug_exists:") || lowered.includes("tenants_slug_unique") || lowered.includes("duplicate key value violates unique constraint");
}
async function loop() {
  const databaseUrl = apiConfig.databaseUrl;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for infra worker");
  }
  const db = createDb(databaseUrl);
  console.log(
    JSON.stringify({
      level: "info",
      type: "worker_start",
      jobExecutionTimeoutMs,
      apiBaseUrl,
      ...runtimeFingerprint
    })
  );
  await waitForApiReady().catch((error) => {
    console.error(
      `[worker] ${error instanceof Error ? error.message : String(error)} \u2014 start the API (pnpm dev apps) then restart the worker.`
    );
    process.exit(1);
  });
  await checkRequiredTenantImages().catch((error) => {
    console.warn(
      `[worker] image pre-check failed: ${error instanceof Error ? error.message : String(error)}`
    );
  });
  while (!shuttingDown) {
    const job = await claimNextJob().catch((error) => {
      if (isApiConnectionError(error)) {
        logApiUnreachable();
        return null;
      }
      console.error(`[worker] claim error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (!job) {
      const nowMs = Date.now();
      if (nowMs - lastLicenseExpireScanMs >= LICENSE_EXPIRE_SCAN_INTERVAL_MS) {
        lastLicenseExpireScanMs = nowMs;
        await expireDueLicenses(db).catch((error) => {
          console.error(
            `[worker] license expire scan failed: ${error instanceof Error ? error.message : String(error)}`
          );
        });
      }
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }
    const stopHeartbeat = startJobHeartbeatLoop(job.id);
    try {
      const handler = handlers[job.type];
      if (!handler) {
        throw new Error(`unsupported_job_type:${job.type}`);
      }
      let provisionComplete;
      if (job.type === "tenant.provision") {
        provisionComplete = await withExecutionTimeout(runProvisionJob(db, job), jobExecutionTimeoutMs);
      } else if (job.type === "add_module") {
        provisionComplete = await withExecutionTimeout(runAddModuleJob(db, job), jobExecutionTimeoutMs);
      } else {
        await withExecutionTimeout(handler(db, job), jobExecutionTimeoutMs);
      }
      await markJobComplete(job.id, provisionComplete);
      await emitWorkerMetric("worker.job.success", 1, { jobType: job.type });
      console.log(
        JSON.stringify({
          level: "info",
          type: "worker_job_result",
          workerId,
          jobId: job.id,
          jobType: job.type,
          outcome: "success"
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker][${job.id}] failed: ${message}`);
      try {
        const cancelledByUser = message.startsWith("cancelled_by_user:");
        const noRetry = cancelledByUser || job.type === "tenant.provision" || job.type === "organization.provision" || job.type === "add_module" || isPermanentProvisionError(message);
        await markJobFailure(job.id, message, noRetry);
        await emitWorkerMetric("worker.job.failure", 1, { jobType: job.type });
        console.log(
          JSON.stringify({
            level: "error",
            type: "worker_job_result",
            workerId,
            jobId: job.id,
            jobType: job.type,
            outcome: "failed",
            error: message
          })
        );
      } catch (reportError) {
        console.error(
          `[worker][${job.id}] failed to report failure: ${reportError instanceof Error ? reportError.message : String(reportError)}`
        );
        const fallbackNoRetry = job.type === "tenant.provision" || job.type === "organization.provision" || job.type === "add_module" || isPermanentProvisionError(message);
        const status = fallbackNoRetry ? "dead" : "pending";
        const nextRunAt = fallbackNoRetry ? null : new Date(Date.now() + 3e4);
        await db.transaction(async (tx) => {
          await tx.update(tenantLifecycleJobs).set({
            status,
            lastError: `worker_fallback_failure_persist:${message}`,
            claimedAt: null,
            claimedBy: null,
            runAt: nextRunAt ?? sql4`${tenantLifecycleJobs.runAt}`,
            updatedAt: /* @__PURE__ */ new Date(),
            completedAt: fallbackNoRetry ? /* @__PURE__ */ new Date() : null,
            attempts: sql4`${tenantLifecycleJobs.attempts} + 1`
          }).where(eq16(tenantLifecycleJobs.id, job.id));
          if (job.type === "tenant.provision" && job.tenantId) {
            await tx.update(tenants).set({ status: "failed" }).where(eq16(tenants.id, job.tenantId));
            await tx.update(tenantDeployments).set({
              status: "failed",
              lastError: `worker_fallback_failure_persist:${message}`,
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq16(tenantDeployments.tenantId, job.tenantId));
          } else if (job.type === "add_module" && job.tenantId) {
            await tx.update(tenants).set({ status: "active" }).where(eq16(tenants.id, job.tenantId));
          }
        }).catch((fallbackError) => {
          console.error(
            `[worker][${job.id}] fallback failure persistence failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
          );
        });
      }
    } finally {
      stopHeartbeat();
    }
  }
}
process.on("SIGTERM", () => {
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", type: "worker_shutdown", signal: "SIGTERM", workerId }));
});
process.on("SIGINT", () => {
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", type: "worker_shutdown", signal: "SIGINT", workerId }));
});
void loop();
//# sourceMappingURL=worker.js.map