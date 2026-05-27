import { apiConfig } from "@repo/config";

import { getControlPlaneRedisClient } from "../lib/redis.js";

/** Production with shared Redis — rate limits must not silently fall back to per-process memory. */
export function isProductionRedisRateLimitRequired(): boolean {
  if (apiConfig.nodeEnv !== "production") return false;
  return Boolean(apiConfig.controlPlaneRedisUrl);
}

export function controlPlaneRedisConfigured(): boolean {
  return Boolean(apiConfig.controlPlaneRedisUrl);
}

/** True when production expects Redis but the shared client is unavailable. */
export function isProductionRedisRateLimitDegraded(): boolean {
  return isProductionRedisRateLimitRequired() && !getControlPlaneRedisClient();
}

/**
 * When production requires Redis for rate limits, limiter store errors must not bypass limits.
 */
export function shouldFailClosedOnRateLimitStoreError(): boolean {
  return isProductionRedisRateLimitRequired();
}
