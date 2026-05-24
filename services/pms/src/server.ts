import { serve } from "@hono/node-server";
import { dbConfig, pmsConfig } from "@repo/config";
import type { Hono } from "hono";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@repo/db/schema";
import { startIcalSyncJob } from "./jobs/ical-sync.js";

type PmsDb = PostgresJsDatabase<typeof schema> | null;

function log(level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      level,
      service: "pms",
      message,
      timestamp: new Date().toISOString(),
      ...extra,
    }),
  );
}

/**
 * Bind the PMS Hono app and start background jobs.
 * Port comes from `PMS_PORT` (see `@repo/config` / root `.env`).
 */
export function startPmsServer(app: Hono, db: PmsDb): void {
  const port = pmsConfig.port;

  if (!dbConfig.databaseUrl) {
    log("warn", "DATABASE_URL is not set — API routes that need Postgres will return 503");
  } else if (!db) {
    log("warn", "Database client failed to initialize — check DATABASE_URL and migrations");
  } else {
    startIcalSyncJob(db, (msg) => log("info", msg.replace(/^\[pms\]\s*/, "")));
  }

  serve({ fetch: app.fetch, port }, (info) => {
    log("info", "PMS service listening", {
      url: `http://127.0.0.1:${info.port}`,
      health: `http://127.0.0.1:${info.port}/health`,
    });
  });
}
