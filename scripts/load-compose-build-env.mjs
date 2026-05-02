/**
 * Merge env for `docker compose build` against infra/tenant-stack/docker-compose.yml`.
 *
 * Loads committed defaults from `env/development/tenant-docker-build.env`, then overrides with
 * `process.env` (CI injects secrets here). Optional explicit BIGCAPITAL_ROOT for non-standard paths.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseEnvFile(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * @param {string} repoRoot
 * @returns {Record<string, string>}
 */
export function loadComposeBuildEnv(repoRoot) {
  const defaultsPath = join(
    repoRoot,
    "env/development/tenant-docker-build.env",
  );
  if (!existsSync(defaultsPath)) {
    throw new Error(`Missing ${defaultsPath} (committed env defaults).`);
  }
  const fileVars = parseEnvFile(readFileSync(defaultsPath, "utf8"));

  const merged = { ...fileVars, ...process.env };

  const resolvedBigcapital =
    process.env.BIGCAPITAL_ROOT?.trim() ||
    fileVars.BIGCAPITAL_ROOT?.trim() ||
    join(repoRoot, "services/bigcapital");

  return {
    ...merged,
    BIGCAPITAL_ROOT: resolvedBigcapital,
    STOCKIX_BC_TAG:
      process.env.STOCKIX_BC_TAG?.trim() ||
      fileVars.STOCKIX_BC_TAG?.trim() ||
      "latest",
    PUBLIC_PROXY_PORT:
      process.env.PUBLIC_PROXY_PORT ||
      fileVars.PUBLIC_PROXY_PORT ||
      "4100",
    DB_USER: process.env.DB_USER || fileVars.DB_USER || "bigcapital",
    DB_PASSWORD: process.env.DB_PASSWORD || fileVars.DB_PASSWORD || "",
    DB_ROOT_PASSWORD:
      process.env.DB_ROOT_PASSWORD || fileVars.DB_ROOT_PASSWORD || "",
    DB_CHARSET: process.env.DB_CHARSET || fileVars.DB_CHARSET || "utf8",
    SYSTEM_DB_NAME:
      process.env.SYSTEM_DB_NAME || fileVars.SYSTEM_DB_NAME || "bigcapital_system",
    TENANT_DB_NAME_PERFIX:
      process.env.TENANT_DB_NAME_PERFIX ||
      fileVars.TENANT_DB_NAME_PERFIX ||
      "bigcapital_tenant_",
    JWT_SECRET: process.env.JWT_SECRET || fileVars.JWT_SECRET || "",
    BASE_URL:
      process.env.BASE_URL ||
      fileVars.BASE_URL ||
      "https://compose-build.invalid",
    AGENDASH_AUTH_USER:
      process.env.AGENDASH_AUTH_USER ||
      fileVars.AGENDASH_AUTH_USER ||
      "agendash",
    AGENDASH_AUTH_PASSWORD:
      process.env.AGENDASH_AUTH_PASSWORD || fileVars.AGENDASH_AUTH_PASSWORD || "",
    SIGNUP_DISABLED:
      process.env.SIGNUP_DISABLED || fileVars.SIGNUP_DISABLED || "true",
    SIGNUP_ALLOWED_EMAILS:
      process.env.SIGNUP_ALLOWED_EMAILS ||
      fileVars.SIGNUP_ALLOWED_EMAILS ||
      "",
    MAIL_HOST: process.env.MAIL_HOST || fileVars.MAIL_HOST || "",
    MAIL_USERNAME: process.env.MAIL_USERNAME || fileVars.MAIL_USERNAME || "",
    MAIL_PASSWORD: process.env.MAIL_PASSWORD || fileVars.MAIL_PASSWORD || "",
    MAIL_PORT: process.env.MAIL_PORT || fileVars.MAIL_PORT || "",
    MAIL_SECURE: process.env.MAIL_SECURE || fileVars.MAIL_SECURE || "",
    MAIL_FROM_NAME:
      process.env.MAIL_FROM_NAME || fileVars.MAIL_FROM_NAME || "",
    MAIL_FROM_ADDRESS:
      process.env.MAIL_FROM_ADDRESS || fileVars.MAIL_FROM_ADDRESS || "",
  };
}

const BUILD_REQUIRED = [
  "DB_PASSWORD",
  "DB_ROOT_PASSWORD",
  "JWT_SECRET",
  "AGENDASH_AUTH_PASSWORD",
];

export function assertComposeBuildSecrets(env) {
  const missing = BUILD_REQUIRED.filter((k) => !String(env[k] ?? "").trim());
  if (missing.length === 0) return;
  throw new Error(
    `Missing Docker build env: ${missing.join(", ")}. Fix env/development/tenant-docker-build.env or set CI variables.`,
  );
}
