import './env'; // Boot validation — must be first
import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { dbConfig, pmsConfig } from "@repo/config";
import type { Hono } from "hono";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import type * as schema from "@repo/db/schema";
import type * as pmsSchema from "@repo/pms-db/schema";
import { startIcalSyncJob } from "./jobs/ical-sync.js";
import { startFinanceSyncJob } from "./jobs/finance-sync-job.js";
import type { PmsEnv } from "./types.js";

type PmsDb = PostgresJsDatabase<typeof pmsSchema> | null;

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
    // Verify that the PMS DB connection role is not a superuser / BYPASSRLS role.
    // RLS policies on pms_* tables are silently skipped for superusers, which would
    // expose cross-tenant guest PII. Set PMS_DATABASE_URL to a role without BYPASSRLS
    // (e.g. stockix_pms_app) to enforce tenant isolation at the database level.
    db.execute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sql`
        SELECT current_user AS role,
               (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls,
               (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser
      `,
    ).then((rows) => {
      const row = rows[0] as { role: string; bypassrls: boolean; is_superuser: boolean } | undefined;
      if (row?.bypassrls || row?.is_superuser) {
        log("warn", "SECURITY: PMS DB connection role has BYPASSRLS or superuser privileges — Row-Level Security is NOT enforced. Set PMS_DATABASE_URL to connect as stockix_pms_app to enforce tenant isolation.", {
          role: row.role,
          bypassrls: row.bypassrls,
          is_superuser: row.is_superuser,
        });
      } else {
        log("info", "PMS RLS check OK — connection role is not superuser", { role: row?.role });
      }
    }).catch((err: unknown) => {
      log("warn", "Could not verify PMS DB role for RLS enforcement", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    startIcalSyncJob(db, (msg) => log("info", msg.replace(/^\[pms\]\s*/, "")));
    startFinanceSyncJob(db, (msg) => log("info", msg.replace(/^\[pms\]\s*/, "")));
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
