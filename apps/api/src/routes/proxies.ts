import type { createDb } from "@repo/db";
import type { Hono } from "hono";

import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import { registerTenantFinanceUsersApi } from "./finance-users.js";
import { registerIntegrationBridgeRoutes } from "./integration-bridge.js";
import { registerPmsProxyRoutes } from "./pms-proxy-http.js";
import { registerPosCredentialsRoutes } from "./pos-credentials.js";
import { registerPosProxyRoutes } from "./pos-proxy-http.js";

type Db = ReturnType<typeof createDb>;

/**
 * Registers all outbound proxy routes (POS platform, PMS, Finance users, POS credentials, integration bridge).
 */
export function registerProxyRoutes(app: Hono<ControlPlaneAuthEnv>, db: Db | null): void {
  registerPosProxyRoutes(app, db);
  registerPmsProxyRoutes(app, db);
  if (!db) return;
  registerTenantFinanceUsersApi(app, db);
  registerPosCredentialsRoutes(app, db);
  registerIntegrationBridgeRoutes(app, db);
}
