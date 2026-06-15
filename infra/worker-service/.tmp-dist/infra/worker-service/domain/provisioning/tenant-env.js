"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTenantComposeEnvBody = buildTenantComposeEnvBody;
exports.writeTenantEnvFileAtomic = writeTenantEnvFileAtomic;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
function buildTenantComposeEnvBody(params) {
    const lines = [
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
async function writeTenantEnvFileAtomic(tenantEnvDir, contents) {
    await (0, promises_1.mkdir)(tenantEnvDir, { recursive: true, mode: 0o700 });
    const target = (0, node_path_1.join)(tenantEnvDir, ".env");
    const tmp = (0, node_path_1.join)(tenantEnvDir, ".env.tmp");
    await (0, promises_1.writeFile)(tmp, contents, { mode: 0o600 });
    await (0, promises_1.rename)(tmp, target);
    return target;
}
