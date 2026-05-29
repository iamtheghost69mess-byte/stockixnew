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
  startStuckProvisioningReconciler,
  stopStuckProvisioningReconciler,
} from "./provisioning/stuck-reconciler.js";

const { app, db, databaseUrl, port } = createControlPlaneApp();

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
  process.exit(1);
});

startReadinessReconciler(db);
if (db) startStuckProvisioningReconciler(db);

function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down reconcilers`);
  stopReadinessReconciler();
  stopStuckProvisioningReconciler();
  process.exit(0);
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

serve({ fetch: app.fetch, port }, (info) => {
  logger.info("api listening", { url: `http://localhost:${info.port}` });
});
