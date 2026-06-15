import type { createDb } from "@repo/db";
import type { Hono } from "hono";

import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import { registerAdminRoutes } from "./admin.js";
import { registerApiKeyRoutes } from "./api-keys.js";
import { registerInternalRoutes } from "./internal.js";
import { registerLicenseApi } from "./licenses.js";
import { registerNotificationsApi } from "./notifications.js";
import { registerOwnerRoutes } from "./owners.js";
import { registerProxyRoutes } from "./proxies.js";
import { registerPublicRoutes } from "./public.js";
import { registerTenantConfigApi } from "./tenant-config.js";
import { registerTenantModulesRoutes } from "./tenant-modules.js";
import { registerTenantRoutes } from "./tenants.js";

type Db = ReturnType<typeof createDb>;

/** Registers all control-plane HTTP routes (after global middleware). */
export function registerControlPlaneRoutes(app: Hono<ControlPlaneAuthEnv>, db: Db | null): void {
  if (!db) return;
  registerPublicRoutes(app, db);
  registerInternalRoutes(app, db);
  registerOwnerRoutes(app, db);
  registerAdminRoutes(app, db);
  registerApiKeyRoutes(app, db);
  registerTenantRoutes(app, db);
  registerLicenseApi(app, db);
  registerTenantConfigApi(app, db);
  registerNotificationsApi(app, db);
  registerTenantModulesRoutes(app, db);
  registerProxyRoutes(app, db);
}
