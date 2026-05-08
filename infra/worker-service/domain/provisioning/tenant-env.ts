import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type TenantEnvFileParams = {
  stockixFinanceRoot: string;
  baseUrl: string;
  jwtSecret: string;
  dbPassword: string;
  dbRootPassword: string;
  publicProxyPort: number;
  signupAllowedEmails: string;
  agendashUser: string;
  agendashPassword: string;
};

export function buildTenantComposeEnvBody(params: TenantEnvFileParams): string {
  const lines: string[] = [
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
    `SIGNUP_DISABLED=true`,
    `SIGNUP_ALLOWED_DOMAINS=`,
    `SIGNUP_ALLOWED_EMAILS=${params.signupAllowedEmails}`,
    `MAIL_HOST=`,
    `MAIL_USERNAME=`,
    `MAIL_PASSWORD=`,
    `MAIL_PORT=`,
    `MAIL_SECURE=`,
    `MAIL_FROM_NAME=`,
    `MAIL_FROM_ADDRESS=`,
    `AGENDASH_AUTH_USER=${params.agendashUser}`,
    `AGENDASH_AUTH_PASSWORD=${params.agendashPassword}`,
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
