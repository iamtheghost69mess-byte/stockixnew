import * as Sentry from "@sentry/node";
import { serve } from "@hono/node-server";
import { apiConfig } from "@repo/config";

import { createControlPlaneApp } from "./app/create-control-plane-app.js";
import { logger } from "./lib/logger.js";
import {
  startReadinessReconciler,
  stopReadinessReconciler,
} from "./provisioning/readiness-reconciler.js";
import {
  startHealthBackgroundPoller,
  stopHealthBackgroundPoller,
} from "./lib/health-cache.js";
import {
  startStuckProvisioningReconciler,
  stopStuckProvisioningReconciler,
} from "./provisioning/stuck-reconciler.js";

const { app, db, databaseUrl, port } = createControlPlaneApp();

if (apiConfig.nodeEnv === "production") {
  const { ensureControlPlaneRedisReady } = await import("./lib/redis.js");
  try {
    await ensureControlPlaneRedisReady(10_000);
    logger.info("Control plane Redis ready", { event: "startup_redis_ready" });
  } catch (error) {
    logger.error(
      "Control plane Redis failed readiness check — refusing to start",
      error,
      { event: "startup_redis_unavailable" },
    );
    process.exit(1);
  }
}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;
let retryCount = 0;

process.on("unhandledRejection", (reason, promise) => {
  if (apiConfig.sentryDsn?.trim()) {
    Sentry.captureException(reason);
  }
  logger.error("unhandled_rejection", reason, {
    type: "unhandled_rejection",
    promise: String(promise),
  });
});

process.on("uncaughtException", (error) => {
  if (apiConfig.sentryDsn?.trim()) {
    Sentry.captureException(error);
  }
  logger.error("uncaught_exception", error, { type: "uncaught_exception" });
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EADDRINUSE") {
    console.error(
      `✖ Could not bind port ${port} after ${MAX_RETRIES} retries.\n   Run pnpm dev:kill and try again.`,
    );
  } else {
    console.error("✖ API failed to start:", error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
});

startReadinessReconciler(db);
if (db) {
  startStuckProvisioningReconciler(db);
  startHealthBackgroundPoller(db);
}

// Verify owner_notifications table exists — migration 0041 must be applied.
if (db) {
  void (async () => {
    try {
      const { sql } = await import("drizzle-orm");
      const rows = await db.execute(
        sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'owner_notifications' LIMIT 1`,
      );
      if (!(rows as unknown[]).length) {
        logger.error(
          "owner_notifications table missing — migration 0041 not applied. Notifications will fail. Run: pnpm db:migrate",
          undefined,
          { event: "startup_missing_table_owner_notifications" },
        );
      }
    } catch (err) {
      logger.error("Could not verify owner_notifications table", err, {
        event: "startup_table_check_failed",
      });
    }
  })();
}

let server: ReturnType<typeof serve>;

async function startWithRetry(): Promise<void> {
  while (retryCount <= MAX_RETRIES) {
    try {
      server = serve({ fetch: app.fetch, port }, (info) => {
        logger.info("api listening", { url: `http://localhost:${info.port}` });
      });
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "EADDRINUSE" && retryCount < MAX_RETRIES) {
        retryCount++;
        console.warn(
          `⚠ Port ${port} in use. Retry ${retryCount}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms...`,
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      if (err.code === "EADDRINUSE") {
        console.error(
          `✖ Could not bind port ${port} after ${MAX_RETRIES} retries.\n   Run pnpm dev:kill and try again.`,
        );
      } else {
        console.error("✖ API failed to start:", err.message);
      }
      process.exit(1);
    }
  }
}

await startWithRetry();

function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  stopReadinessReconciler();
  stopStuckProvisioningReconciler();
  stopHealthBackgroundPoller();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

if (databaseUrl) {
  void import("./provisioning/provision-notify-listener.js").then(
    ({ startProvisionNotifyListener }) => {
      startProvisionNotifyListener(databaseUrl, (message) => logger.info(message));
      logger.info("Provision NOTIFY listener started");
    },
  );
}

void import("./jobs/license-expiry-queue.js").then(
  ({ startLicenseExpiryWorker, isLicenseExpiryQueueEnabled }) => {
    if (db && apiConfig.runBullMqConsumers && isLicenseExpiryQueueEnabled()) {
      startLicenseExpiryWorker(db, (msg) => logger.info(msg));
      logger.info("License expiry BullMQ worker started");
    } else if (db && !apiConfig.runBullMqConsumers) {
      logger.info("License expiry BullMQ worker disabled (RUN_BULLMQ_CONSUMERS=false)");
    }
  },
);

void import("./jobs/owner-invite-mail-queue.js").then(
  ({ startOwnerInviteMailWorker, isOwnerInviteMailQueueEnabled }) => {
    if (db && apiConfig.runBullMqConsumers && isOwnerInviteMailQueueEnabled()) {
      startOwnerInviteMailWorker(db, (msg) => logger.info(msg));
      logger.info("Owner invite mail BullMQ worker started");
    } else if (db && !apiConfig.runBullMqConsumers) {
      logger.info("Owner invite mail BullMQ worker disabled (RUN_BULLMQ_CONSUMERS=false)");
    }
  },
);
