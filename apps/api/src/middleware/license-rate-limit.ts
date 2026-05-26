import type { MiddlewareHandler } from "hono";
import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from "rate-limiter-flexible";

import { getControlPlaneRedisClient } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

const redisClient = getControlPlaneRedisClient();

const ipLimiter = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl_lic_ip",
      points: 5,
      duration: 60,
    })
  : new RateLimiterMemory({ points: 5, duration: 60 });

const keyLimiter = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl_lic_key",
      points: 10,
      duration: 900,
    })
  : new RateLimiterMemory({ points: 10, duration: 900 });

function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

export function licenseKeyFingerprint(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 32) || "unknown";
}

export async function consumeLicenseActivateKeyLimit(
  licenseKey: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const key = licenseKeyFingerprint(licenseKey);
  try {
    await keyLimiter.consume(key);
    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      return { ok: false, retryAfterSec: Math.ceil(err.msBeforeNext / 1000) };
    }
    return { ok: true };
  }
}

/** Per-IP rate limit for POST /licenses/activate and /licenses/verify-offline. */
export function licenseActivateRateLimitMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;
    if (
      path !== "/licenses/activate"
      && path !== "/licenses/verify-offline"
    ) {
      await next();
      return;
    }
    const ip = clientIp(c.req.raw.headers);
    try {
      await ipLimiter.consume(ip);
      await next();
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        logger.warn("license_activate_rate_limit", { ip, event: "ip_limit" });
        return c.json({ success: false, error: "invalid_license" }, 429);
      }
      logger.warn("license_activate_rate_limit_redis_error", { ip });
      await next();
    }
  };
}
