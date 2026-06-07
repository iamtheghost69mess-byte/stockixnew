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

/** Shared Redis client for rate limiting (CONTROL_PLANE_REDIS_URL). */
export function getControlPlaneRedisClient(): Redis | null {
  const url = apiConfig.controlPlaneRedisUrl;
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
      const pong = await client.ping();
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
