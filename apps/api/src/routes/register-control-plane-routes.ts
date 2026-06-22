import { Hono } from "hono";
import type { createDb } from "@repo/db";

import { logger } from "../lib/logger.js";
import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import { isLegacyVersionedPath } from "../middleware/known-api-paths.js";
import { registerAdminRoutes } from "./admin.js";
import { registerApiKeyRoutes } from "./api-keys.js";
import { registerFeatureFlagRoutes } from "./feature-flags.js";
import { registerInternalRoutes } from "./internal.js";
import { registerLicenseApi } from "./licenses.js";
import { registerNotificationsApi } from "./notifications.js";
import { registerOwnerRoutes } from "./owners.js";
import { registerProxyRoutes } from "./proxies.js";
import { registerPublicRoutes } from "./public.js";
import { registerTenantConfigApi } from "./tenant-config.js";
import { registerTenantModulesRoutes } from "./tenant-modules.js";
import { registerTenantRoutes } from "./tenants/index.js";

type Db = ReturnType<typeof createDb>;

const SUNSET_DATE = "Sat, 20 Sep 2026 00:00:00 GMT";

/** Registers all versioned domain routes on the given Hono app/sub-app. */
function registerVersionedRoutes(router: Hono<ControlPlaneAuthEnv>, db: Db): void {
  registerOwnerRoutes(router, db);
  registerAdminRoutes(router, db);
  registerApiKeyRoutes(router, db);
  registerTenantRoutes(router, db);
  registerLicenseApi(router, db);
  registerTenantConfigApi(router, db);
  registerNotificationsApi(router, db);
  registerTenantModulesRoutes(router, db);
  registerProxyRoutes(router, db);
  registerFeatureFlagRoutes(router, db);
}

/** Registers all control-plane HTTP routes (after global middleware). */
export function registerControlPlaneRoutes(app: Hono<ControlPlaneAuthEnv>, db: Db | null): void {
  if (!db) return;

  // Non-versioned infrastructure routes
  registerPublicRoutes(app, db);
  registerInternalRoutes(app, db);

  // Deprecation middleware — fires after route handler for any matched legacy path.
  // The logger.warn emits structured "legacy_path_hit" events so operators can
  // identify remaining callers before the unversioned mount is removed (2026-09-15).
  app.use("*", async (c, next) => {
    await next();
    const path = c.req.path;
    if (!path.startsWith("/v1") && isLegacyVersionedPath(path)) {
      c.header("Deprecation", "true");
      c.header("Sunset", SUNSET_DATE);
      c.header("Link", `</v1${path}>; rel="successor-version"`);
      logger.warn("legacy_path_hit", {
        path,
        method: c.req.method,
        userAgent: c.req.header("user-agent") ?? "unknown",
        origin: c.req.header("origin") ?? "unknown",
      });
    }
  });

  // V1 routes — authoritative (Stage 1: parallel with legacy)
  const v1 = new Hono<ControlPlaneAuthEnv>();
  registerVersionedRoutes(v1, db);
  app.route("/v1", v1);

  // Legacy routes — kept for backward compatibility until 2026-09-20
  registerVersionedRoutes(app, db);
}
