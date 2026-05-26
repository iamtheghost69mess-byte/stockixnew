var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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
var licenseConfig = {
  defaultTermDays: parseInt(process.env.DEFAULT_LICENSE_TERM_DAYS ?? "365", 10)
};

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
  /** Mongo ObjectId of the POS organization wired to this control-plane org. */
  posOrganizationId: text("pos_organization_id"),
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

// src/license-utils.ts
import { randomBytes } from "crypto";

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

// ../../infra/worker-service/domain/provision-trace.ts
import { sql } from "drizzle-orm";
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
        sql`SELECT pg_notify(${PROVISION_NOTIFY_CHANNEL}, ${JSON.stringify(payload)})`
      );
    }
  };
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
  const defaultVendorId = readOptionalPositiveId(body.defaultVendorId);
  const inventoryAccountId = readOptionalPositiveId(body.inventoryAccountId);
  const inventoryVarianceAccountId = readOptionalPositiveId(
    body.inventoryVarianceAccountId
  );
  const bridgeNote = serviceChargeItemId || discountItemId ? ` serviceCharge=${serviceChargeItemId ?? "n/a"} discount=${discountItemId ?? "n/a"}` : "";
  params.log?.(
    `[provision] POS defaults seeded walkIn=${walkInCustomerId} cash=${cashAccountId} card=${cardAccountId}${bridgeNote} vendor=${defaultVendorId ?? "n/a"}`
  );
  return {
    walkInCustomerId,
    cashAccountId,
    cardAccountId,
    serviceChargeItemId,
    discountItemId,
    defaultVendorId,
    inventoryAccountId,
    inventoryVarianceAccountId
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
  if (input.defaultVendorId && input.defaultVendorId > 0) {
    body.defaultVendorId = input.defaultVendorId;
  }
  if (input.inventoryAccountId && input.inventoryAccountId > 0) {
    body.inventoryAccountId = input.inventoryAccountId;
  }
  if (input.inventoryVarianceAccountId && input.inventoryVarianceAccountId > 0) {
    body.inventoryVarianceAccountId = input.inventoryVarianceAccountId;
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

export {
  env,
  mailConfig,
  isMailConfigured,
  apiConfig,
  posConfig,
  moduleGatingConfig,
  owners,
  tenants,
  tenantConfig,
  tenantDeployments,
  tenantProvisionEvents,
  adminAuditLog,
  tenantLifecycleJobs,
  licenses,
  ownerNotifications,
  schema_exports,
  parseLicenseModulesJson,
  getActiveLicenseForTenant,
  getLicenseExpiry,
  getPlanLimits,
  isLicenseLimitsConsistentWithPlan,
  insertLicenseHistory,
  createProvisionTracer,
  normalizeFinanceApiJson,
  parseFinanceApiJsonText,
  activateFinanceWarehouses,
  seedFinancePosDefaults,
  buildFinanceInternalUrlForPos,
  wirePosBigcapitalIntegration,
  syncFinanceLicense
};
//# sourceMappingURL=chunk-OZPPGGSF.js.map