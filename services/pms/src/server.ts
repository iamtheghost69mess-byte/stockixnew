import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { dbConfig, pmsConfig } from "@repo/config";
import type { Hono } from "hono";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@repo/db/schema";
import { startIcalSyncJob } from "./jobs/ical-sync.js";
import type { PmsEnv } from "./types.js";

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
export function startPmsServer(app: Hono<PmsEnv>, db: PmsDb): void {
  const port = parseInt(process.env.PMS_PORT ?? String(pmsConfig.port), 10) || 3003;

  if (!dbConfig.databaseUrl) {
    log("warn", "DATABASE_URL is not set — API routes that need Postgres will return 503");
  } else if (!db) {
    log("warn", "Database client failed to initialize — check DATABASE_URL and migrations");
  } else {
    startIcalSyncJob(db, (msg) => log("info", msg.replace(/^\[pms\]\s*/, "")));
  }

  const server = createServer(getRequestListener(app.fetch));

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log("error", `Port ${port} already in use — run pnpm dev:kill and retry`, {
        code: err.code,
      });
    } else {
      log("error", err.message, { code: err.code });
    }
    process.exit(1);
  });

  server.listen(port, () => {
    log("info", "PMS service listening", {
      url: `http://127.0.0.1:${port}`,
      health: `http://127.0.0.1:${port}/health`,
    });
  });
}
