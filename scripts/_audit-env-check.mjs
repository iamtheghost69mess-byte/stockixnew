import fs from "node:fs";
const required = [
  "DATABASE_URL", "DB_POOL_MAX", "DB_IDLE_TIMEOUT_SECONDS",
  "DB_CONNECT_TIMEOUT_SECONDS", "DB_MAX_LIFETIME_SECONDS",
  "PLATFORM_API_SECRET", "WORKER_SECRET", "SESSION_SECRET",
  "DASHBOARD_URL", "AUTH_TOKEN_SECRET", "DEPLOYMENT_SECRET_KEY",
  "LICENSE_SIGNING_SECRET", "CONTROL_PLANE_REDIS_URL",
];
const env = {};
for (const line of fs.readFileSync("infra/prod/.env", "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const compose = fs.readFileSync("infra/prod/docker-compose.yml", "utf8");
console.log(JSON.stringify({
  missingInProdEnv: required.filter((k) => !env[k]?.trim()),
  notInCompose: required.filter((k) => !compose.includes(k)),
  securityHstsQuoted: /^["']/.test(env.SECURITY_HSTS ?? ""),
  securityCspQuoted: /^["']/.test(env.SECURITY_CSP_BASE ?? ""),
}, null, 2));
