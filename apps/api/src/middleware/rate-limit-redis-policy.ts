import { getControlPlaneRedisClient } from "../lib/redis.js";

/** Production with shared Redis — rate limits must not silently fall back to per-process memory. */
export function isProductionRedisRateLimitRequired(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const url = process.env.CONTROL_PLANE_REDIS_URL?.trim();
  return Boolean(url);
}

export function controlPlaneRedisConfigured(): boolean {
  return Boolean(process.env.CONTROL_PLANE_REDIS_URL?.trim());
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
