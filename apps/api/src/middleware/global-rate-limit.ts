import type { MiddlewareHandler } from "hono";
import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from "rate-limiter-flexible";

import { getControlPlaneRedisClient } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import {
  isProductionRedisRateLimitRequired,
  shouldFailClosedOnRateLimitStoreError,
} from "./rate-limit-redis-policy.js";

const redisClient = getControlPlaneRedisClient();
const redisRequired = isProductionRedisRateLimitRequired();

const globalLimiterRedis = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl_global",
      points: 100,
      duration: 60,
    })
  : null;
const globalLimiterMemory = new RateLimiterMemory({ points: 100, duration: 60 });

const authLimiterRedis = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl_auth",
      points: 20,
      duration: 900,
    })
  : null;
const authLimiterMemory = new RateLimiterMemory({ points: 20, duration: 900 });

const publicTenantIpLimiterRedis = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl_public_tenant_ip",
      points: 10,
      duration: 60,
    })
  : null;
const publicTenantIpLimiterMemory = new RateLimiterMemory({ points: 10, duration: 60 });

const publicTenantSlugLimiterRedis = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl_public_slug",
      points: 3,
      duration: 60,
    })
  : null;
const publicTenantSlugLimiterMemory = new RateLimiterMemory({ points: 3, duration: 60 });

if (!redisClient && !redisRequired) {
  logger.warn(
    "CONTROL_PLANE_REDIS_URL not set — rate limiting is in-memory only. " +
      "This is NOT safe for multi-instance deployments.",
  );
}

function resolveClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function rateLimitUnavailableResponse(c: Parameters<MiddlewareHandler>[0]) {
  return c.json(
    { success: false, error: "Rate limiting temporarily unavailable" },
    503,
  );
}

/** Stricter limits for GET /public/tenant/:slug (10/min per IP, 3/min per slug). */
export function publicTenantDiscoveryRateLimitMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const match = /^\/public\/tenant\/([^/]+)$/.exec(c.req.path);
    if (!match) {
      await next();
      return;
    }
    const slug = match[1] ?? "";
    const ip = resolveClientIp(c.req.raw.headers);
    const failClosed = shouldFailClosedOnRateLimitStoreError();
    const ipPrimary = publicTenantIpLimiterRedis ?? publicTenantIpLimiterMemory;
    const ipFallback = failClosed ? null : publicTenantIpLimiterMemory;
    const slugPrimary = publicTenantSlugLimiterRedis ?? publicTenantSlugLimiterMemory;
    const slugFallback = failClosed ? null : publicTenantSlugLimiterMemory;

    const consumeOr429 = async (
      primary: typeof ipPrimary,
      fallback: typeof ipFallback,
      key: string,
    ): Promise<"ok" | "limited" | "unavailable"> => {
      try {
        await primary.consume(key);
        return "ok";
      } catch (err) {
        if (err instanceof RateLimiterRes) {
          const retryAfterSec = Math.ceil(err.msBeforeNext / 1000);
          c.header("Retry-After", String(retryAfterSec));
          return "limited";
        }
        if (failClosed) {
          logger.error("public_tenant_discovery_rate_limit_store_error", { key });
          return "unavailable";
        }
        if (!fallback) return "unavailable";
        try {
          await fallback.consume(key);
          return "ok";
        } catch (fallbackErr) {
          if (fallbackErr instanceof RateLimiterRes) {
            const retryAfterSec = Math.ceil(fallbackErr.msBeforeNext / 1000);
            c.header("Retry-After", String(retryAfterSec));
            return "limited";
          }
          return "unavailable";
        }
      }
    };

    const ipResult = await consumeOr429(ipPrimary, ipFallback, ip);
    if (ipResult === "unavailable") return rateLimitUnavailableResponse(c);
    if (ipResult === "limited") {
      logger.warn("public_tenant_discovery_rate_limit", { ip, slug, scope: "ip" });
      return c.json({ error: "rate_limited" }, 429);
    }
    const slugResult = await consumeOr429(slugPrimary, slugFallback, slug);
    if (slugResult === "unavailable") return rateLimitUnavailableResponse(c);
    if (slugResult === "limited") {
      logger.warn("public_tenant_discovery_rate_limit", { ip, slug, scope: "slug" });
      return c.json({ error: "rate_limited" }, 429);
    }
    await next();
  };
}

/** @deprecated Use publicTenantDiscoveryRateLimitMiddleware */
export const publicTenantOrgsRateLimitMiddleware = publicTenantDiscoveryRateLimitMiddleware;

/** Redis-backed rate limits; fail closed in production when CONTROL_PLANE_REDIS_URL is set. */
export function globalRateLimitMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;
    if (path === "/health" || path === "/ready" || path.startsWith("/internal/jobs")) {
      await next();
      return;
    }

    const ip = resolveClientIp(c.req.raw.headers);
    const isAuthPath = path.startsWith("/auth/");
    const failClosed = shouldFailClosedOnRateLimitStoreError();
    const primary = isAuthPath
      ? (authLimiterRedis ?? (failClosed ? null : authLimiterMemory))
      : (globalLimiterRedis ?? (failClosed ? null : globalLimiterMemory));
    const fallback = failClosed ? null : isAuthPath ? authLimiterMemory : globalLimiterMemory;

    if (!primary) {
      return rateLimitUnavailableResponse(c);
    }

    try {
      await primary.consume(ip);
      await next();
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        const retryAfterSec = Math.ceil(err.msBeforeNext / 1000);
        c.header("Retry-After", String(retryAfterSec));
        c.header("X-RateLimit-Reset", String(Date.now() + err.msBeforeNext));
        return c.json({ success: false, error: "Too many requests" }, 429);
      }
      if (failClosed) {
        logger.error("global_rate_limit_store_error", { ip, path });
        return rateLimitUnavailableResponse(c);
      }
      logger.warn("Rate limiter Redis error — falling back to memory", { ip, path });
      if (!fallback) return rateLimitUnavailableResponse(c);
      try {
        await fallback.consume(ip);
        await next();
      } catch (fallbackErr) {
        if (fallbackErr instanceof RateLimiterRes) {
          const retryAfterSec = Math.ceil(fallbackErr.msBeforeNext / 1000);
          c.header("Retry-After", String(retryAfterSec));
          c.header("X-RateLimit-Reset", String(Date.now() + fallbackErr.msBeforeNext));
          return c.json({ success: false, error: "Too many requests" }, 429);
        }
        return rateLimitUnavailableResponse(c);
      }
    }
  };
}
