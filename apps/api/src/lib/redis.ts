import { createRequire } from "node:module";
import type { Redis } from "ioredis";

import { logger } from "./logger.js";

const require = createRequire(import.meta.url);
const RedisCtor = require("ioredis") as new (
  url: string,
  options?: Record<string, unknown>,
) => Redis;

let controlPlaneRedis: Redis | null = null;

/** Shared Redis client for rate limiting (CONTROL_PLANE_REDIS_URL). */
export function getControlPlaneRedisClient(): Redis | null {
  const url = process.env.CONTROL_PLANE_REDIS_URL?.trim();
  if (!url) return null;
  if (!controlPlaneRedis) {
    const client = new RedisCtor(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on("error", (err: Error) => {
      logger.warn("Control plane Redis connection error", { err: err.message });
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
