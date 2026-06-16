import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { apiConfig, env } from "@repo/config";

export type TenantEnvFileParams = {
  mysqlVolumeName: string;
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
  redisPassword?: string;
  mongoRootPassword?: string;
  // --- Networking / Traefik ---
  /** Tenant slug used for Traefik label host rule and network naming. */
  tenantSlug?: string;
  /** Root domain (e.g. stockix.cloud or localhost). */
  tenantRootDomain?: string;
  /** Enable Traefik Docker labels ("true" in production, "false" in local dev). */
  traefikLabelsEnabled?: string;
  /** Traefik-facing Docker network name (default: stockix_public). */
  traefikNetwork?: string;
  /** Worker-facing internal Docker network name (default: stockix_internal). */
  workerInternalNetwork?: string;
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


/** Single source of truth for per-tenant .env file and docker compose `--env-file` substitution. */
export function buildTenantEnvMap(params: TenantEnvFileParams): Record<string, string> {
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
    DB_CHARSET: "utf8mb4",
    SYSTEM_DB_CLIENT: "mysql",
    SYSTEM_DB_HOST: "mysql",
    SYSTEM_DB_USER: "stockix_tenant",
    SYSTEM_DB_PASSWORD: params.dbPassword,
    SYSTEM_DB_NAME: "stockix_system",
    SYSTEM_DB_CHARSET: "utf8mb4",
    TENANT_DB_CLIENT: "mysql",
    TENANT_DB_HOST: "mysql",
    TENANT_DB_USER: "stockix_tenant",
    TENANT_DB_PASSWORD: params.dbPassword,
    TENANT_DB_NAME_PREFIX: "stockix_tenant_",
    TENANT_DB_NAME_PERFIX: "stockix_tenant_",
    TENANT_DB_CHARSET: "utf8mb4",
    JWT_SECRET: params.jwtSecret,
    MONGODB_DATABASE_URL: env.MONGODB_DATABASE_URL ?? "mongodb://mongo/stockix",
    PUBLIC_PROXY_PORT: String(params.publicProxyPort),
    PUBLIC_PROXY_SSL_PORT: "443",
    ...signup,
    MAIL_HOST: env.MAIL_HOST ?? "",
    MAIL_USERNAME: env.MAIL_USERNAME ?? "",
    MAIL_PASSWORD: mailPassword,
    MAIL_PORT: env.MAIL_PORT ?? "",
    MAIL_SECURE: mailSecureEnvValue(),
    MAIL_FROM_NAME: env.MAIL_FROM_NAME ?? "",
    MAIL_FROM_ADDRESS: env.MAIL_FROM_ADDRESS ?? "",
    REDIS_HOST: "redis",
    REDIS_PORT: "6379",
    REDIS_PASSWORD: params.redisPassword ?? "",
    REDIS_DB: "0",
    QUEUE_HOST: "redis",
    QUEUE_PORT: "6379",
    S3_REGION: params.s3Region,
    S3_ACCESS_KEY_ID: s3AccessKeyId,
    S3_SECRET_ACCESS_KEY: s3SecretAccessKey,
    S3_ENDPOINT: params.s3Endpoint,
    S3_BUCKET: params.s3Bucket,
    S3_FORCE_PATH_STYLE: params.s3ForcePathStyle,
    AGENDASH_AUTH_USER: params.agendashUser,
    AGENDASH_AUTH_PASSWORD: params.agendashPassword,
    INTERNAL_API_SECRET: params.internalApiSecret ?? "",
    MONGO_ROOT_PASSWORD: params.mongoRootPassword ?? "",
    BILLING_ENABLED: "false",
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
    PORT: "3000",
    NODE_ENV: "production",
    AGENDA_DB_COLLECTION: process.env.AGENDA_DB_COLLECTION ?? "stockix-jobs",
    AGENDA_POOL_TIME: process.env.AGENDA_POOL_TIME ?? "every 1 minute",
    AGENDA_CONCURRENCY: process.env.AGENDA_CONCURRENCY ?? "20",
    // --- Networking / Traefik (consumed by tenant docker-compose.yml) ---
    TENANT_SLUG: params.tenantSlug ?? "",
    TENANT_ROOT_DOMAIN: params.tenantRootDomain ?? "localhost",
    TRAEFIK_LABELS_ENABLED: params.traefikLabelsEnabled ?? "false",
    TRAEFIK_NETWORK: params.traefikNetwork ?? "stockix_public",
    WORKER_INTERNAL_NETWORK: params.workerInternalNetwork ?? "stockix_internal",
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
