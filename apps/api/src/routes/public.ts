import { apiConfig, getMailHealthStatus } from "@repo/config";
import { tenantConfig, tenants } from "@repo/db/schema";
import type { createDb } from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
import type { Hono } from "hono";

import { isValidPublicDiscoverySlug } from "../lib/tenant-discovery-slug.js";
import { logger } from "../lib/logger.js";

import { getGlobalHealthStatus, getHealthStatus } from "../lib/health-cache.js";

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
  app.get("/ready", (c) => {
    const globalStatus = getGlobalHealthStatus();
    const status = globalStatus.ready ? 200 : 503;
    return c.json(globalStatus, status);
  });

  app.get("/health", (c) => {
    const globalStatus = getGlobalHealthStatus();
    return c.json({
      status: globalStatus.ready ? "ok" : "fail",
      checks: globalStatus.checks,
      mail: getMailHealthStatus(),
    });
  });

  app.get("/health/redis", (c) => {
    const s = getHealthStatus("redis");
    return c.json(s, s.status === "ok" ? 200 : 503);
  });

  app.get("/health/db", (c) => {
    const s = getHealthStatus("database");
    return c.json(s, s.status === "ok" ? 200 : 503);
  });

  app.get("/health/docker", (c) => {
    const s = getHealthStatus("docker");
    return c.json(s, s.status === "ok" ? 200 : 503);
  });

  app.get("/health/provisioning", (c) => {
    const s = getHealthStatus("provisioning");
    return c.json(s, s.status === "ok" ? 200 : 503);
  });

  app.get("/metrics", async (c) => {
    const {
      renderPrometheusMetrics,
      deadLetterJobsGauge,
      activeProvisioningJobsGauge,
      expiredLicensesGauge,
    } = await import("../lib/prometheus.js");
    if (db) {
      const { deadLetterJobs, tenantLifecycleJobs, licenses } = await import("@repo/db/schema");
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(deadLetterJobs);
      deadLetterJobsGauge.set(Number(row?.count ?? 0));

      const [provRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tenantLifecycleJobs)
        .where(
          and(
            eq(tenantLifecycleJobs.type, "tenant.provision"),
            eq(tenantLifecycleJobs.status, "running"),
          ),
        );
      activeProvisioningJobsGauge.set(Number(provRow?.count ?? 0));

      const [licRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(licenses)
        .where(eq(licenses.status, "expired"));
      expiredLicensesGauge.set(Number(licRow?.count ?? 0));
    }
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
