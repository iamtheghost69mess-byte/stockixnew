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
  signupAllowedEmails: string;
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

/** Shared signup policy for tenant .env file and composeEnv (root .env → apiConfig). */
export function buildTenantSignupEnv(adminEmail: string): TenantSignupEnv {
  const override = apiConfig.signupAllowedEmailsOverride.trim();
  const allowedEmails = [adminEmail];
  if (override) {
    allowedEmails.push(
      ...override.split(",").map((s) => s.trim()).filter(Boolean),
    );
  }
  return {
    SIGNUP_DISABLED: apiConfig.signupDisabled ? "true" : "false",
    SIGNUP_ALLOWED_DOMAINS: apiConfig.signupAllowedDomains,
    SIGNUP_ALLOWED_EMAILS: allowedEmails.join(","),
  };
}

function mailSecureEnvValue(): string {
  return env.MAIL_SECURE === "true" || env.MAIL_SECURE === "1" ? "true" : "";
}

export function buildTenantComposeEnvBody(params: TenantEnvFileParams): string {
  const signup = buildTenantSignupEnv(params.signupAllowedEmails);
  const lines: string[] = [
    `MYSQL_VOLUME_NAME=${params.mysqlVolumeName}`,
    `STOCKIX_TENANT_APP_ROOT=${params.stockixFinanceRoot}`,
    `BASE_URL=${params.baseUrl}`,
    `DB_CLIENT=mysql`,
    `DB_HOST=mysql`,
    `DB_USER=stockix_tenant`,
    `DB_PASSWORD=${params.dbPassword}`,
    `DB_ROOT_PASSWORD=${params.dbRootPassword}`,
    `DB_CHARSET=utf8`,
    `SYSTEM_DB_CLIENT=mysql`,
    `SYSTEM_DB_HOST=mysql`,
    `SYSTEM_DB_USER=stockix_tenant`,
    `SYSTEM_DB_PASSWORD=${params.dbPassword}`,
    `SYSTEM_DB_NAME=stockix_system`,
    `TENANT_DB_CLIENT=mysql`,
    `TENANT_DB_HOST=mysql`,
    `TENANT_DB_USER=stockix_tenant`,
    `TENANT_DB_PASSWORD=${params.dbPassword}`,
    `TENANT_DB_NAME_PERFIX=stockix_tenant_`,
    `JWT_SECRET=${params.jwtSecret}`,
    `MONGODB_DATABASE_URL=mongodb://mongo/stockix`,
    `PUBLIC_PROXY_PORT=${params.publicProxyPort}`,
    `PUBLIC_PROXY_SSL_PORT=443`,
    `SIGNUP_DISABLED=${signup.SIGNUP_DISABLED}`,
    `SIGNUP_ALLOWED_DOMAINS=${signup.SIGNUP_ALLOWED_DOMAINS}`,
    `SIGNUP_ALLOWED_EMAILS=${signup.SIGNUP_ALLOWED_EMAILS}`,
    `MAIL_HOST=${env.MAIL_HOST ?? ""}`,
    `MAIL_USERNAME=${env.MAIL_USERNAME ?? ""}`,
    `MAIL_PASSWORD=${env.MAIL_PASSWORD ?? ""}`,
    `MAIL_PORT=${env.MAIL_PORT ?? ""}`,
    `MAIL_SECURE=${mailSecureEnvValue()}`,
    `MAIL_FROM_NAME=${env.MAIL_FROM_NAME ?? ""}`,
    `MAIL_FROM_ADDRESS=${env.MAIL_FROM_ADDRESS ?? ""}`,
    `S3_REGION=${params.s3Region}`,
    `S3_ACCESS_KEY_ID=${params.s3AccessKeyId}`,
    `S3_SECRET_ACCESS_KEY=${params.s3SecretAccessKey}`,
    `S3_ENDPOINT=${params.s3Endpoint}`,
    `S3_BUCKET=${params.s3Bucket}`,
    `AGENDASH_AUTH_USER=${params.agendashUser}`,
    `AGENDASH_AUTH_PASSWORD=${params.agendashPassword}`,
    `INTERNAL_API_SECRET=${params.internalApiSecret ?? ""}`,
    "",
    "# Stockix platform integration",
    `REACT_APP_STOCKIX_API_URL=${params.stockixApiUrl ?? ""}`,
    `REACT_APP_STOCKIX_TENANT_ID=${params.stockixTenantId ?? ""}`,
  ];
  return `${lines.join("\n")}\n`;
}

export async function writeTenantEnvFileAtomic(
  tenantEnvDir: string,
  contents: string,
): Promise<string> {
  await mkdir(tenantEnvDir, { recursive: true, mode: 0o700 });
  const target = join(tenantEnvDir, ".env");
  const tmp = join(tenantEnvDir, ".env.tmp");
  await writeFile(tmp, contents, { mode: 0o600 });
  await rename(tmp, target);
  return target;
}
