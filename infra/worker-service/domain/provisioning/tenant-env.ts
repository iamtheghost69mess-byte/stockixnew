import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultTenantEnvRoot } from "../env-paths.js";
import { slugToMysqlSafe } from "../provisioner.js";
import { apiConfig, env } from "@repo/config";
import {
  encryptDeploymentSecret,
  isEncryptedDeploymentSecret,
} from "@repo/shared/deployment-secrets";

export type TenantEnvFileParams = {
  slug: string;
  stockixFinanceRoot: string;
  baseUrl: string;
  jwtSecret: string;
  dbPassword: string;
  dbRootPassword: string;
  publicProxyPort: number;
  adminEmail: string;
  agendashUser: string;
  agendashPassword: string;
  s3Region: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3Endpoint: string;
  s3Bucket: string;
  s3ForcePathStyle: string;
  stockixTenantId?: string;
  /** Public discovery slug (not tenant UUID) for Finance webapp branding fetch. */
  stockixDiscoverySlug?: string;
  stockixApiUrl?: string;
  internalApiSecret?: string;
  stockixAppName?: string;
  stockixLogoUrl?: string;
  stockixPrimaryColor?: string;
  /** Browser origins allowed for Finance Socket.IO (comma-separated). */
  socketAllowedOrigins?: string;
};

/** Signup policy copied from repo root `.env` into each tenant Finance stack. */
export function buildTenantSignupEnv(): {
  SIGNUP_DISABLED: string;
  SIGNUP_ALLOWED_DOMAINS: string;
  SIGNUP_ALLOWED_EMAILS: string;
} {
  return {
    SIGNUP_DISABLED: apiConfig.signupDisabled ? "true" : "false",
    SIGNUP_ALLOWED_DOMAINS: apiConfig.signupAllowedDomains,
    SIGNUP_ALLOWED_EMAILS: apiConfig.signupAllowedEmailsOverride,
  };
}

function mailSecureEnvValue(): string {
  return env.MAIL_SECURE === "true" || env.MAIL_SECURE === "1" ? "true" : "";
}

function maybeEncryptEnvValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || isEncryptedDeploymentSecret(trimmed)) return trimmed;
  return encryptDeploymentSecret(trimmed, apiConfig.deploymentSecretKey);
}

/**
 * Shared infrastructure hostnames — sourced from env set in prod docker-compose.yml.
 * All tenant containers join the `stockix-shared` Docker network and resolve
 * these hostnames via Docker DNS.
 */
function sharedMysqlHost(): string {
  return process.env.SHARED_MYSQL_HOST ?? "stockix-mysql";
}

function sharedMongoHost(): string {
  return process.env.SHARED_MONGO_HOST ?? "stockix-mongo";
}

function tenantRedisHost(): string {
  return process.env.TENANT_REDIS_HOST ?? "stockix-redis";
}

/**
 * Build the per-tenant MongoDB connection URL.
 * Each tenant gets its own MongoDB database: {slug}_pos
 * The replica set name (rs0) matches the stockix-mongo container init.
 *
 * FIX: Previously all tenants shared the same "stockix" database because
 * MONGODB_DATABASE_URL was passed through from the platform env unchanged.
 * Now each tenant gets an isolated database scoped to its slug.
 */
export function buildTenantMongoUrl(slug: string): string {
  const host = sharedMongoHost();
  return `mongodb://${host}:27017/${slug}_pos?replicaSet=rs0&directConnection=true`;
}

/**
 * Build the per-tenant Redis URL.
 * All tenants share stockix-redis but use a key prefix for isolation:
 *   tenant:{slug}:queue:*    BullMQ (POS + Finance NestJS via REDIS_KEY_PREFIX)
 *   tenant:{slug}:agenda:*   Finance Agenda scheduler (Mongo collection name)
 * Finance auth is stateless JWT (no Redis session store). If session middleware
 * is added later, use REDIS_KEY_PREFIX + "session:" as the store key prefix.
 */
function buildTenantRedisUrl(slug: string): string {
  const host = tenantRedisHost();
  return `redis://${host}:6379/0`;
}

function buildTenantRedisKeyPrefix(slug: string): string {
  return `tenant:${slug}:`;
}

/**
 * Per-tenant MySQL user name — scoped to this tenant's databases only.
 * The provisioner creates this user with GRANT on stockix_{safe}_% (finance, system, org DBs).
 */
function buildTenantMysqlUser(slug: string): string {
  return `tenant_${slugToMysqlSafe(slug)}`;
}

/** Single source of truth for per-tenant .env file and docker compose `--env-file` substitution. */
export function buildTenantEnvMap(params: TenantEnvFileParams): Record<string, string> {
  const { slug } = params;
  const signup = buildTenantSignupEnv();
  const mailPassword = env.MAIL_PASSWORD ?? "";
  const s3AccessKeyId = params.s3AccessKeyId;
  const s3SecretAccessKey = params.s3SecretAccessKey;

  const mysqlHost = sharedMysqlHost();
  const mysqlSafe = slugToMysqlSafe(slug);
  const tenantDbUser = buildTenantMysqlUser(slug);
  const mongoUrl = buildTenantMongoUrl(slug);
  const redisUrl = buildTenantRedisUrl(slug);
  const redisKeyPrefix = buildTenantRedisKeyPrefix(slug);

  return {
    STOCKIX_TENANT_APP_ROOT: params.stockixFinanceRoot,
    BASE_URL: params.baseUrl,

    // ── MySQL (stockix-mysql) ───────────────────────────────────────────
    DB_CLIENT: "mysql",
    DB_HOST: mysqlHost,
    DB_USER: tenantDbUser,
    DB_PASSWORD: params.dbPassword,
    DB_ROOT_PASSWORD: params.dbRootPassword,
    DB_CHARSET: "utf8mb4",

    SYSTEM_DB_CLIENT: "mysql",
    SYSTEM_DB_HOST: mysqlHost,
    SYSTEM_DB_USER: tenantDbUser,
    SYSTEM_DB_PASSWORD: params.dbPassword,
    SYSTEM_DB_NAME: `stockix_${mysqlSafe}_system`,
    SYSTEM_DB_CHARSET: "utf8mb4",

    TENANT_DB_CLIENT: "mysql",
    TENANT_DB_HOST: mysqlHost,
    TENANT_DB_USER: tenantDbUser,
    TENANT_DB_PASSWORD: params.dbPassword,
    TENANT_DB_NAME_PREFIX: `stockix_${mysqlSafe}_`,
    TENANT_DB_NAME_PERFIX: `stockix_${mysqlSafe}_`,
    TENANT_DB_CHARSET: "utf8mb4",

    // ── MongoDB (stockix-mongo) — per-tenant database ───────────────────
    // Per-tenant Mongo DB isolation — slug_pos pattern
    MONGODB_DATABASE_URL: mongoUrl,
    MONGODB_URI: mongoUrl,

    // ── Redis (stockix-redis) — shared with key prefix isolation ────────
    REDIS_HOST: tenantRedisHost(),
    REDIS_PORT: "6379",
    REDIS_PASSWORD: "",
    REDIS_DB: "0",
    REDIS_URL: redisUrl,
    REDIS_KEY_PREFIX: redisKeyPrefix,
    QUEUE_HOST: tenantRedisHost(),
    QUEUE_PORT: "6379",

    // ── Auth ───────────────────────────────────────────────────────────
    JWT_SECRET: params.jwtSecret,

    // ── Proxy port (kept for Traefik config — server still binds a random host port) ──
    PUBLIC_PROXY_PORT: String(params.publicProxyPort),
    PUBLIC_PROXY_SSL_PORT: "443",

    // ── Signup policy ──────────────────────────────────────────────────
    ...signup,

    // ── Mail ───────────────────────────────────────────────────────────
    MAIL_HOST: env.MAIL_HOST ?? "",
    MAIL_USERNAME: env.MAIL_USERNAME ?? "",
    MAIL_PASSWORD: mailPassword ? maybeEncryptEnvValue(mailPassword) : "",
    MAIL_PORT: env.MAIL_PORT ?? "",
    MAIL_SECURE: mailSecureEnvValue(),
    MAIL_FROM_NAME: env.MAIL_FROM_NAME ?? "",
    MAIL_FROM_ADDRESS: env.MAIL_FROM_ADDRESS ?? "",

    // ── S3 / Backblaze ────────────────────────────────────────────────
    S3_REGION: params.s3Region,
    S3_ACCESS_KEY_ID: s3AccessKeyId ? maybeEncryptEnvValue(s3AccessKeyId) : "",
    S3_SECRET_ACCESS_KEY: s3SecretAccessKey ? maybeEncryptEnvValue(s3SecretAccessKey) : "",
    S3_ENDPOINT: params.s3Endpoint,
    S3_BUCKET: params.s3Bucket,
    S3_FORCE_PATH_STYLE: params.s3ForcePathStyle,

    // ── Misc ──────────────────────────────────────────────────────────
    AGENDASH_AUTH_USER: params.agendashUser,
    AGENDASH_AUTH_PASSWORD: params.agendashPassword,
    INTERNAL_API_SECRET: params.internalApiSecret ?? "",
    DEPLOYMENT_SECRET_KEY: apiConfig.deploymentSecretKey,
    BILLING_ENABLED: "false",

    // ── Finance webapp branding ────────────────────────────────────────
    REACT_APP_STOCKIX_API_URL: params.stockixApiUrl ?? "",
    REACT_APP_STOCKIX_TENANT_ID: params.stockixTenantId ?? "",
    REACT_APP_STOCKIX_DISCOVERY_SLUG: params.stockixDiscoverySlug ?? "",
    REACT_APP_STOCKIX_APP_NAME: params.stockixAppName ?? "",
    REACT_APP_STOCKIX_LOGO_URL: params.stockixLogoUrl ?? "",
    REACT_APP_STOCKIX_PRIMARY_COLOR: params.stockixPrimaryColor ?? "",

    PUBLIC_BASE_URL: params.baseUrl,
    SOCKET_ALLOWED_ORIGINS: params.socketAllowedOrigins ?? params.baseUrl,

    THROTTLE_GLOBAL_TTL: String(env.THROTTLE_GLOBAL_TTL),
    THROTTLE_GLOBAL_LIMIT: String(env.THROTTLE_GLOBAL_LIMIT),
    THROTTLE_AUTH_TTL: String(env.THROTTLE_AUTH_TTL),
    THROTTLE_AUTH_LIMIT: String(env.THROTTLE_AUTH_LIMIT),
  };
}

export function serializeTenantEnvMap(map: Record<string, string>): string {
  return `${Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")}\n`;
}

export function buildTenantEnvFileContent(params: TenantEnvFileParams): string {
  return serializeTenantEnvMap(buildTenantEnvMap(params));
}

/** Parse tenant `.env` at `{TENANT_ENV_ROOT}/{slug}/.env` for docker compose env injection. */
export async function readTenantEnvFile(slug: string): Promise<Record<string, string>> {
  const path = join(defaultTenantEnvRoot(), slug, ".env");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return {};
    }
    throw err;
  }
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export async function writeTenantEnvFileAtomic(
  tenantEnvDir: string,
  map: Record<string, string>,
): Promise<string> {
  const contents = serializeTenantEnvMap(map);
  await mkdir(tenantEnvDir, { recursive: true, mode: 0o700 });
  const target = join(tenantEnvDir, ".env");
  const tmp = join(tenantEnvDir, ".env.tmp");
  await writeFile(tmp, contents, { mode: 0o600 });
  await rename(tmp, target);
  return target;
}