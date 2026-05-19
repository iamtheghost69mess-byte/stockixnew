import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@repo/config";

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
  stockixTenantId?: string;
  stockixApiUrl?: string;
  internalApiSecret?: string;
};

export type TenantSignupEnv = {
  SIGNUP_DISABLED: string;
  SIGNUP_ALLOWED_DOMAINS: string;
  SIGNUP_ALLOWED_EMAILS: string;
};

/** Shared signup policy for tenant .env — public register fully disabled, no allowlist. */
export function buildTenantSignupEnv(): TenantSignupEnv {
  return {
    SIGNUP_DISABLED: "true",
    SIGNUP_ALLOWED_DOMAINS: "",
    SIGNUP_ALLOWED_EMAILS: "",
  };
}

function mailSecureEnvValue(): string {
  return env.MAIL_SECURE === "true" || env.MAIL_SECURE === "1" ? "true" : "";
}

/** Single source of truth for per-tenant .env file and docker compose `--env-file` substitution. */
export function buildTenantEnvMap(params: TenantEnvFileParams): Record<string, string> {
  const signup = buildTenantSignupEnv();
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
    SIGNUP_DISABLED: signup.SIGNUP_DISABLED,
    SIGNUP_ALLOWED_DOMAINS: signup.SIGNUP_ALLOWED_DOMAINS,
    SIGNUP_ALLOWED_EMAILS: signup.SIGNUP_ALLOWED_EMAILS,
    MAIL_HOST: env.MAIL_HOST ?? "",
    MAIL_USERNAME: env.MAIL_USERNAME ?? "",
    MAIL_PASSWORD: env.MAIL_PASSWORD ?? "",
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
    S3_ACCESS_KEY_ID: params.s3AccessKeyId,
    S3_SECRET_ACCESS_KEY: params.s3SecretAccessKey,
    S3_ENDPOINT: params.s3Endpoint,
    S3_BUCKET: params.s3Bucket,
    S3_FORCE_PATH_STYLE: "false",
    AGENDASH_AUTH_USER: params.agendashUser,
    AGENDASH_AUTH_PASSWORD: params.agendashPassword,
    INTERNAL_API_SECRET: params.internalApiSecret ?? "",
    BILLING_ENABLED: "false",
    REACT_APP_STOCKIX_API_URL: params.stockixApiUrl ?? "",
    REACT_APP_STOCKIX_TENANT_ID: params.stockixTenantId ?? "",
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
