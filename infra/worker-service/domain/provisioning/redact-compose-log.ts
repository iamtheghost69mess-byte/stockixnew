/** Env keys whose values must never appear in compose stdout/stderr logs. */
export const SENSITIVE_ENV_KEYS = new Set([
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "MAIL_PASSWORD",
  "DB_PASSWORD",
  "DB_ROOT_PASSWORD",
  "SYSTEM_DB_PASSWORD",
  "TENANT_DB_PASSWORD",
  "AUTH_TOKEN_SECRET",
  "INTERNAL_API_SECRET",
  "DEPLOYMENT_SECRET_KEY",
  "LICENSE_SIGNING_SECRET",
  "PLATFORM_JWT_SECRET",
  "PLATFORM_JWT_REFRESH_SECRET",
  "FIELD_ENCRYPTION_KEY",
  "RESEND_API_KEY",
  "WORKER_SECRET",
  "SESSION_SECRET",
  "POS_PLATFORM_API_KEY",
  "AGENDASH_AUTH_PASSWORD",
  "S3_SECRET_ACCESS_KEY",
  "PIN_LOOKUP_SECRET",
]);

const REDACTED = "[REDACTED]";

function redactKnownKeyValue(line: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const envPattern = new RegExp(`(${escaped}\\s*=\\s*)(\\S+)`, "gi");
  const jsonPattern = new RegExp(`("${escaped}"\\s*:\\s*")([^"]*)(")`, "gi");
  return line.replace(envPattern, `$1${REDACTED}`).replace(jsonPattern, `$1${REDACTED}$3`);
}

/** Redact sensitive key/value patterns from a single compose log line. */
export function redactComposeLogLine(line: string): string {
  let out = line;
  for (const key of SENSITIVE_ENV_KEYS) {
    out = redactKnownKeyValue(out, key);
  }
  return out;
}

/** Return a copy of env suitable for debug logging (values redacted for sensitive keys). */
export function redactEnvForLogging(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = SENSITIVE_ENV_KEYS.has(key) ? REDACTED : value;
  }
  return out;
}
