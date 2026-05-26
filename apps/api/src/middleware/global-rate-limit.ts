import type { MiddlewareHandler } from "hono";

type Bucket = { count: number; resetAt: number };

const globalBuckets = new Map<string, Bucket>();
const authBuckets = new Map<string, Bucket>();

const GLOBAL_WINDOW_MS = 60_000;
const GLOBAL_LIMIT = 100;
const AUTH_WINDOW_MS = 15 * 60_000;
const AUTH_LIMIT = 20;

function resolveClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function checkLimit(
  buckets: Map<string, Bucket>,
  key: string,
  windowMs: number,
  limit: number,
): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { allowed: true };
}

/** In-memory rate limits for public API routes (excludes /health and worker internals). */
export function globalRateLimitMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;
    if (path === "/health" || path.startsWith("/internal/jobs")) {
      await next();
      return;
    }

    const ip = resolveClientIp(c.req.raw.headers);
    const isAuth = path.startsWith("/auth");
    const result = checkLimit(
      isAuth ? authBuckets : globalBuckets,
      `${isAuth ? "auth" : "global"}:${ip}`,
      isAuth ? AUTH_WINDOW_MS : GLOBAL_WINDOW_MS,
      isAuth ? AUTH_LIMIT : GLOBAL_LIMIT,
    );

    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfter));
      return c.json(
        { error: "rate_limited", retryAfter: result.retryAfter },
        429,
      );
    }

    await next();
  };
}
