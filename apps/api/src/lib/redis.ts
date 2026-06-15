import { createRequire } from "node:module";
import type { Redis } from "ioredis";

import { apiConfig } from "@repo/config";

import { logger } from "./logger.js";

const require = createRequire(import.meta.url);
const RedisCtor = require("ioredis") as new (
  url: string,
  options?: Record<string, unknown>,
) => Redis;

let controlPlaneRedis: Redis | null = null;
let consecutiveFailures = 0;

/** Tripped when consecutive failures reach 3 or more. */
export function isRedisCircuitBreakerTripped(): boolean {
  return consecutiveFailures >= 3;
}

export function resetRedisCircuitBreaker(): void {
  consecutiveFailures = 0;
}

/** Shared Redis client for rate limiting (CONTROL_PLANE_REDIS_URL). */
export function getControlPlaneRedisClient(): Redis | null {
  const url = apiConfig.controlPlaneRedisUrl;
  if (!url) return null;
  if (!controlPlaneRedis) {
    const client = new RedisCtor(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 3000,
      commandTimeout: 2000,
      retryStrategy(times: number) {
        if (times > 3) {
          logger.warn(`Redis connection failed 3 times consecutively. Circuit breaker state: TRIPPED`);
          return null;
        }
        const delay = Math.min(1000, 100 * Math.pow(2, times));
        logger.warn(`Redis connection retry attempt ${times} in ${delay}ms`);
        return delay;
      },
    });
    client.on("error", (err: Error) => {
      consecutiveFailures++;
      logger.error(
        `Control plane Redis connection error (consecutive failure count: ${consecutiveFailures}): ${err.message}`
      );
    });
    client.on("connect", () => {
      logger.info("Control plane Redis connected");
      consecutiveFailures = 0;
    });
    client.on("ready", () => {
      logger.info("Control plane Redis ready");
      consecutiveFailures = 0;
    });
    void client.connect().catch((err: unknown) => {
      logger.warn("Control plane Redis initial connect failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    });
    controlPlaneRedis = client;
  }
  return controlPlaneRedis;
}

/** Block startup until control-plane Redis responds to PING (production hard-fail). */
export async function ensureControlPlaneRedisReady(timeoutMs = 10_000): Promise<void> {
  const url = apiConfig.controlPlaneRedisUrl;
  if (!url) {
    throw new Error("CONTROL_PLANE_REDIS_URL is not configured");
  }
  const client = getControlPlaneRedisClient();
  if (!client) {
    throw new Error("Control plane Redis client failed to initialize");
  }
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;
  while (Date.now() < deadline) {
    try {
      if (client.status === "wait") {
        await client.connect();
      }
      const pingPromise = client.ping();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Redis ping timeout")), 2000)
      );
      const pong = await Promise.race([pingPromise, timeoutPromise]);
      if (pong === "PONG") {
        return;
      }
      lastError = new Error(`unexpected Redis PING response: ${pong}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw lastError ?? new Error("Control plane Redis not ready within timeout");
}
