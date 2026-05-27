import * as Sentry from "@sentry/node";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiConfig } from "@repo/config";
import { createDb } from "@repo/db";

import { initEmailLogging } from "../mail/email-log.js";
import { emitMetric } from "../lib/metrics.js";
import { logger } from "../lib/logger.js";
import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import { registerControlPlaneMiddleware } from "../middleware/register-control-plane.js";
import {
  globalRateLimitMiddleware,
  publicTenantDiscoveryRateLimitMiddleware,
} from "../middleware/global-rate-limit.js";
import { licenseActivateRateLimitMiddleware } from "../middleware/license-rate-limit.js";
import { securityHeadersMiddleware } from "../middleware/security-headers.js";
import { registerAuthRoutes } from "../routes/auth/index.js";
import { registerControlPlaneRoutes } from "../routes/register-control-plane-routes.js";
import { registerWebhooks } from "../routes/webhooks.js";

export type ControlPlaneApp = {
  app: Hono<ControlPlaneAuthEnv>;
  db: ReturnType<typeof createDb> | null;
  databaseUrl: string | undefined;
  port: number;
  platformApiSecret: string | undefined;
  workerSecret: string | undefined;
};

function isTransientDbError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lowered = message.toLowerCase();
  return (
    lowered.includes("too many clients") ||
    lowered.includes("connection terminated") ||
    lowered.includes("timeout") ||
    lowered.includes("econnreset") ||
    lowered.includes("remaining connection slots are reserved")
  );
}

export function createControlPlaneApp(): ControlPlaneApp {
  if (apiConfig.sentryDsn?.trim()) {
    Sentry.init({
      dsn: apiConfig.sentryDsn,
      environment: apiConfig.nodeEnv,
      tracesSampleRate: 0.1,
    });
  }

  const databaseUrl = apiConfig.databaseUrl;
  const db = databaseUrl ? createDb(databaseUrl) : null;
  const app = new Hono<ControlPlaneAuthEnv>();
  const platformApiSecret = apiConfig.platformApiSecret;
  const workerSecret = apiConfig.workerSecret;

  apiConfig.validateRequiredEnv();

  if (apiConfig.nodeEnv === "production" && !apiConfig.controlPlaneRedisUrl) {
    logger.error(
      "CONTROL_PLANE_REDIS_URL is required in production for distributed rate limiting",
      undefined,
      { event: "startup_redis_required" },
    );
    process.exit(1);
  }

  // Auth + webhooks before CORS: session cookies and webhook signature verification.
  if (db) {
    initEmailLogging(db);
    registerAuthRoutes(app, db);
    registerWebhooks(app, db);
  }

  app.onError((err, c) => {
    if (apiConfig.sentryDsn?.trim()) {
      Sentry.captureException(err);
    }
    logger.error("Unhandled API error", err, { path: c.req.path, method: c.req.method });
    if (isTransientDbError(err)) {
      return c.json(
        {
          error: "service_unavailable",
          message: "Database temporarily unavailable. Retry shortly.",
        },
        503,
      );
    }
    const errMessage = err instanceof Error ? err.message : String(err);
    if (errMessage.includes('relation "email_logs" does not exist')) {
      return c.json(
        {
          error: "schema_outdated",
          message: "Database is missing email_logs. From the repo root run: pnpm db:migrate",
        },
        503,
      );
    }
    return c.json({ error: "internal_error", message: "An unexpected error occurred." }, 500);
  });

  const rootDomain = apiConfig.rootDomain;

  app.use(
    "/*",
    cors({
      origin: (origin) => {
        if (!origin) return origin;
        const baseOrigins = rootDomain
          ? [
              `https://${rootDomain}`,
              `http://${rootDomain}`,
              `https://www.${rootDomain}`,
              `https://dashboard.${rootDomain}`,
            ]
          : [];
        const devOrigins =
          apiConfig.nodeEnv !== "production"
            ? [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:3001",
              ]
            : [];
        const allowed = [...baseOrigins, ...devOrigins, ...(apiConfig.corsOrigins ?? [])];
        if (allowed.includes(origin)) return origin;
        if (!rootDomain) return null;
        const isSubdomain =
          origin.endsWith(`.${rootDomain}`) ||
          origin === `https://${rootDomain}` ||
          origin === `http://${rootDomain}`;
        return isSubdomain ? origin : null;
      },
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    }),
  );

  app.use("/*", securityHeadersMiddleware);
  app.use("/*", globalRateLimitMiddleware());
  app.use("/*", publicTenantDiscoveryRateLimitMiddleware());
  app.use("/*", licenseActivateRateLimitMiddleware());

  app.use("/*", async (c, next) => {
    const requestId =
      c.req.header("x-request-id") ?? c.req.header("x-correlation-id") ?? randomUUID();
    c.set("requestId", requestId);
    c.set("requestStartMs", Date.now());
    c.header("x-request-id", requestId);
    const startedAt = Date.now();
    await next();
    const latencyMs = Date.now() - startedAt;
    const isClaimPoll = c.req.method === "POST" && c.req.path === "/internal/jobs/claim";
    if (!isClaimPoll) {
      logger.info("http_request", {
        type: "http_request",
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        latencyMs,
      });
    }
    await emitMetric("api.request.latency_ms", latencyMs, {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
    });
  });

  registerControlPlaneMiddleware(app, { db, platformApiSecret, workerSecret });
  registerControlPlaneRoutes(app, db);

  app.notFound((c) => {
    return c.json(
      {
        success: false,
        error: "Not found",
        path: c.req.path,
        method: c.req.method,
      },
      404,
    );
  });

  return {
    app,
    db,
    databaseUrl,
    port: apiConfig.port,
    platformApiSecret,
    workerSecret,
  };
}
