/**
 * Production tuning for tenant provisioning. All values have safe defaults.
 * Parse once per process — restart API after changing env.
 */

export type ProvisionRuntimeConfig = {
  healthTimeoutMs: number;
  healthFetchTimeoutMs: number;
  healthPollMinMs: number;
  healthPollMaxMs: number;
  /** Use fast poll interval (pollMinMs) for attempts 1..N inclusive, then pollMaxMs. */
  healthFastPollAttempts: number;
  migrationMaxAttempts: number;
  migrationRetryDelayMs: number;
  dockerComposeTimeoutMs: number;
  /** POST /api/auth/register from provisioner to BigCapital. */
  registerFetchTimeoutMs: number;
  maxConcurrentProvisions: number;
};

function parseIntEnv(
  key: string,
  defaultVal: number,
  min: number,
  max?: number,
): number {
  const raw = process.env[key]?.trim();
  if (!raw) return defaultVal;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) return defaultVal;
  if (max !== undefined && n > max) return max;
  return Math.floor(n);
}

export function loadProvisionConfig(): ProvisionRuntimeConfig {
  return {
    healthTimeoutMs: parseIntEnv(
      "PROVISION_HEALTH_TIMEOUT_MS",
      180_000,
      10_000,
      3_600_000,
    ),
    healthFetchTimeoutMs: parseIntEnv(
      "PROVISION_HEALTH_FETCH_TIMEOUT_MS",
      45_000,
      2_000,
      120_000,
    ),
    healthPollMinMs: parseIntEnv(
      "PROVISION_HEALTH_POLL_MIN_MS",
      450,
      100,
      5_000,
    ),
    healthPollMaxMs: parseIntEnv(
      "PROVISION_HEALTH_POLL_MAX_MS",
      2_500,
      500,
      30_000,
    ),
    healthFastPollAttempts: parseIntEnv(
      "PROVISION_HEALTH_FAST_POLL_ATTEMPTS",
      90,
      10,
      600,
    ),
    migrationMaxAttempts: parseIntEnv(
      "PROVISION_MIGRATION_MAX_ATTEMPTS",
      8,
      1,
      50,
    ),
    migrationRetryDelayMs: parseIntEnv(
      "PROVISION_MIGRATION_RETRY_DELAY_MS",
      3_000,
      500,
      120_000,
    ),
    dockerComposeTimeoutMs: parseIntEnv(
      "PROVISION_DOCKER_COMPOSE_TIMEOUT_MS",
      900_000,
      60_000,
      3_600_000,
    ),
    registerFetchTimeoutMs: parseIntEnv(
      "PROVISION_REGISTER_FETCH_TIMEOUT_MS",
      120_000,
      10_000,
      600_000,
    ),
    maxConcurrentProvisions: parseIntEnv(
      "PROVISION_MAX_CONCURRENT",
      2,
      1,
      20,
    ),
  };
}

let cached: ProvisionRuntimeConfig | null = null;

export function getProvisionConfig(): ProvisionRuntimeConfig {
  cached ??= loadProvisionConfig();
  return cached;
}
