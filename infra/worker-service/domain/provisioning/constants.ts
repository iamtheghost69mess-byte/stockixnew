import { apiConfig } from "@repo/config";

export const TENANT_MIGRATION_MAX_ATTEMPTS = 8;
export const TENANT_MIGRATION_RETRY_DELAY_MS = 3_000;
export const STOCKIX_FINANCE_HEALTH_TIMEOUT_MS = 180_000;
export const STOCKIX_FINANCE_HEALTH_POLL_MS = 2_000;
export const COMPOSE_DOWN_TIMEOUT_MS = 2 * 60 * 1000;

/** Resolve execa timeout for a docker compose invocation from subcommand and args. */
export function resolveComposeStepTimeoutMs(args: string[]): number {
  const subcommand = args[0];
  if (subcommand === "down") return COMPOSE_DOWN_TIMEOUT_MS;
  if (subcommand === "run") return apiConfig.dockerComposeRunTimeoutMs;
  if (subcommand === "up" || subcommand === "build" || subcommand === "pull") {
    return apiConfig.dockerComposeUpTimeoutMs;
  }
  return apiConfig.dockerComposeDefaultTimeoutMs;
}
