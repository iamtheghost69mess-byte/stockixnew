import type { Hono } from "hono";
import type { createDb } from "@repo/db";
import type { ControlPlaneAuthEnv } from "../../middleware/auth.js";
import { registerTenantRoutesLegacy } from "../tenants-shared.js";

type Db = ReturnType<typeof createDb>;

export function registerTenantRoutes(app: Hono<ControlPlaneAuthEnv>, db: Db | null): void {
  if (!db) return;
  registerTenantRoutesLegacy(app, db);
}
