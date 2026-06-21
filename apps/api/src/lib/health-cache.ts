import { execa } from "execa";
import { getControlPlaneRedisClient, isRedisCircuitBreakerTripped } from "./redis.js";
import { getMailHealthStatus } from "@repo/config";
import type { createDb } from "@repo/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

type Db = ReturnType<typeof createDb>;

export type HealthStatus = {
  status: "ok" | "fail";
  detail?: string;
  timestamp: string;
};

export type GlobalHealthStatus = {
  ready: boolean;
  checks: {
    database: HealthStatus;
    redis: HealthStatus;
    docker: HealthStatus;
    provisioning: HealthStatus;
    mail: {
      status: string;
      transport: string;
    };
  };
  timestamp: string;
};

let dbInstance: Db | null = null;

const cache = {
  database: { status: "fail", detail: "Not checked yet", timestamp: new Date().toISOString() } as HealthStatus,
  redis: { status: "fail", detail: "Not checked yet", timestamp: new Date().toISOString() } as HealthStatus,
  docker: { status: "fail", detail: "Not checked yet", timestamp: new Date().toISOString() } as HealthStatus,
  provisioning: { status: "ok", detail: "Not checked yet", timestamp: new Date().toISOString() } as HealthStatus,
};

export async function refreshDatabaseHealth(): Promise<HealthStatus> {
  const ts = new Date().toISOString();
  if (!dbInstance) {
    return { status: "fail", detail: "DATABASE_URL is not configured", timestamp: ts };
  }
  try {
    await dbInstance.execute(sql`SELECT 1`);
    return { status: "ok", timestamp: ts };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("Health check: database check failed", err);
    return { status: "fail", detail, timestamp: ts };
  }
}

export async function refreshRedisHealth(): Promise<HealthStatus> {
  const ts = new Date().toISOString();
  const redisClient = getControlPlaneRedisClient();
  if (!redisClient) {
    return { status: "fail", detail: "Redis is not configured or client failed to initialize", timestamp: ts };
  }
  try {
    const pingPromise = redisClient.ping();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Redis ping timeout")), 2000)
    );
    const pong = await Promise.race([pingPromise, timeoutPromise]);
    if (pong === "PONG") {
      return { status: "ok", timestamp: ts };
    }
    return { status: "fail", detail: `Unexpected Redis ping response: ${pong}`, timestamp: ts };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("Health check: Redis check failed", err);
    return { status: "fail", detail, timestamp: ts };
  }
}

export async function refreshDockerHealth(): Promise<HealthStatus> {
  const ts = new Date().toISOString();
  try {
    // Check if docker is responsive
    await execa("docker", ["info"], { timeout: 3000 });
    
    // Check if required tenant images exist
    const requiredImages = [
      "stockix-server:local",
      "stockix-database-migration:local",
    ];
    const missing: string[] = [];
    for (const image of requiredImages) {
      try {
        await execa("docker", ["image", "inspect", image], { timeout: 2000 });
      } catch {
        missing.push(image);
      }
    }
    if (missing.length > 0) {
      return {
        status: "fail",
        detail: `Missing required tenant images: ${missing.join(", ")}. Run: pnpm docker:prebuild`,
        timestamp: ts
      };
    }
    return { status: "ok", timestamp: ts };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("Health check: Docker / image check failed", err);
    return { status: "fail", detail, timestamp: ts };
  }
}

export function refreshProvisioningHealth(): HealthStatus {
  const ts = new Date().toISOString();
  const redisTripped = isRedisCircuitBreakerTripped();
  if (redisTripped) {
    return {
      status: "fail",
      detail: "Provisioning disabled: Redis circuit breaker is tripped due to instability.",
      timestamp: ts
    };
  }
  return { status: "ok", timestamp: ts };
}

export async function refreshAllHealthCaches(): Promise<void> {
  cache.database = await refreshDatabaseHealth();
  cache.redis = await refreshRedisHealth();
  cache.docker = await refreshDockerHealth();
  cache.provisioning = refreshProvisioningHealth();
}

export function getHealthStatus(type: "database" | "redis" | "docker" | "provisioning"): HealthStatus {
  if (type === "provisioning") {
    const freshProvisioning = refreshProvisioningHealth();
    cache.provisioning = freshProvisioning;
  }
  return cache[type];
}

export function getGlobalHealthStatus(): GlobalHealthStatus {
  cache.provisioning = refreshProvisioningHealth();

  // docker check is intentionally excluded: the API container has no docker CLI.
  // Docker image availability is verified by the worker and the post-deploy prebuild step.
  const isReady =
    cache.database.status === "ok" &&
    cache.redis.status === "ok" &&
    cache.provisioning.status === "ok";

  const mailStatus = getMailHealthStatus();

  return {
    ready: isReady,
    checks: {
      database: cache.database,
      redis: cache.redis,
      docker: cache.docker,
      provisioning: cache.provisioning,
      mail: {
        status: mailStatus.configured ? "ok" : "unconfigured",
        transport: mailStatus.transport,
      },
    },
    timestamp: new Date().toISOString(),
  };
}

let intervalId: NodeJS.Timeout | null = null;

export function startHealthBackgroundPoller(db: Db | null): void {
  dbInstance = db;
  if (intervalId) return;

  // Run initial check
  void refreshAllHealthCaches();

  // Run poller every 8 seconds
  intervalId = setInterval(() => {
    void refreshAllHealthCaches().catch((err) => {
      logger.error("Failed to refresh health status cache in poller", err);
    });
  }, 8000);
}

export function stopHealthBackgroundPoller(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
