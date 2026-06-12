import { apiConfig, getMailHealthStatus } from "@repo/config";
import { tenantConfig, tenants } from "@repo/db/schema";
import type { createDb } from "@repo/db";
import { eq, sql } from "drizzle-orm";
import type { Hono } from "hono";

import { isValidPublicDiscoverySlug } from "../lib/tenant-discovery-slug.js";
import { logger } from "../lib/logger.js";

type Db = ReturnType<typeof createDb>;

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    actorEffectiveRole?: string;
    actorPermissions?: string[];
    apiKeyId?: string;
    requestId: string;
    requestStartMs: number;
  };
};

export function registerPublicRoutes(app: Hono<ApiEnv>, db: Db | null): void {
  app.get("/ready", async (c) => {
    const checks: Record<string, "ok" | "fail"> = {};
    const reasons: Record<string, string> = {};
    let isReady = true;

    if (!db) {
      checks.database = "fail";
      reasons.database = "DATABASE_URL is not configured";
      isReady = false;
    } else {
      try {
        await db.execute(sql`SELECT 1`);
        checks.database = "ok";
      } catch (err) {
        checks.database = "fail";
        reasons.database = err instanceof Error ? err.message : String(err);
        isReady = false;
        logger.error("Readiness check: database failed", err);
      }
    }

    const redisUrl = apiConfig.controlPlaneRedisUrl;
    const redisClient = (await import("../lib/redis.js")).getControlPlaneRedisClient();
    if (redisUrl) {
      if (!redisClient) {
        checks.redis = "fail";
        reasons.redis = "Redis client is not initialized";
        isReady = false;
      } else {
        try {
          const pong = await redisClient.ping();
          checks.redis = pong === "PONG" ? "ok" : "fail";
          if (checks.redis === "fail") {
            reasons.redis = "Ping response was not PONG";
            isReady = false;
          }
        } catch (err) {
          checks.redis = "fail";
          reasons.redis = err instanceof Error ? err.message : String(err);
          isReady = false;
          logger.error("Readiness check: redis failed", err);
        }
      }
    }

    const status = isReady ? 200 : 503;
    return c.json(
      { ready: isReady, checks, reasons, timestamp: new Date().toISOString() },
      status,
    );
  });

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      mail: getMailHealthStatus(),
    }),
  );

  app.get("/metrics", async (c) => {
    const { renderPrometheusMetrics } = await import("../lib/prometheus.js");
    const body = await renderPrometheusMetrics();
    return c.text(body, 200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
  });

  /** Deprecated — UUID-based discovery removed (use slug route). */
  app.get("/public/tenant-orgs/:tenantId", (c) =>
    c.json({ success: false, error: "Not found", path: c.req.path }, 404),
  );

  /** Public tenant branding by discovery slug (not tenant UUID). */
  app.get("/public/tenant/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!isValidPublicDiscoverySlug(slug)) {
      return c.json({ success: false, error: "Not found" }, 404);
    }
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const [row] = await db
      .select({
        appName: tenantConfig.appName,
        logoUrl: tenantConfig.logoUrl,
        primaryColor: tenantConfig.primaryColor,
        tenantName: tenants.name,
      })
      .from(tenantConfig)
      .innerJoin(tenants, eq(tenants.id, tenantConfig.tenantId))
      .where(eq(tenantConfig.publicDiscoverySlug, slug))
      .limit(1);

    if (!row) {
      return c.json({ success: false, error: "Not found" }, 404);
    }

    return c.json({
      displayName: row.appName ?? row.tenantName,
      logoUrl: row.logoUrl,
      primaryColor: row.primaryColor,
    });
  });
}
