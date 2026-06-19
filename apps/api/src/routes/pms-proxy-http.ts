import { apiConfig } from "@repo/config";
import type { Hono } from "hono";
import type { createDb } from "@repo/db";
import { z } from "zod";

import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import { requireEnv } from "../lib/require-env.js";
import { pmsProxyJson } from "../pms-proxy.js";
import {
  assertTenantModuleLicensed,
  respondModuleAccessDenied,
} from "../lib/tenant-module-access.js";
import { assertTenantInOwnerScope } from "../org-access-scope.js";

type Db = ReturnType<typeof createDb>;

const uuidSchema = z.string().uuid();

function buildInternalHeaders(tenantId: string): Record<string, string> {
  const headers: Record<string, string> = {
    "x-stockix-tenant-id": tenantId,
  };
  const secret = apiConfig.platformApiSecret;
  if (secret) {
    headers["x-stockix-internal-secret"] = secret;
  }
  return headers;
}

export function registerPmsProxyRoutes(app: Hono<ControlPlaneAuthEnv>, db?: Db | null): void {
  app.get("/pms/status", async (c) => {
    try {
      return c.json({
        configured: true,
        baseUrl: requireEnv("PMS_BASE_URL", "http://localhost:3003"),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ configured: false, error: message }, 503);
    }
  });

  app.get("/pms/health", async (c) => {
    const { data, status } = await pmsProxyJson("/health", "GET");
    return c.json(data, status as 200);
  });

  app.all("/pms/api/*", async (c) => {
    // Validate tenantId — must be present and a valid UUID
    const rawTenantId = c.req.query("tenantId")?.trim();
    if (!rawTenantId || !uuidSchema.safeParse(rawTenantId).success) {
      return c.json({ error: "bad_request", message: "tenantId query parameter is required and must be a valid UUID" }, 400);
    }

    if (db) {
      // Check the tenant has the PMS module licensed
      const access = await assertTenantModuleLicensed(db, rawTenantId, "pms");
      if (!access.ok) return respondModuleAccessDenied(c, access);

      // Check the authenticated actor is scoped to this tenant
      const actorId = c.get("actorId");
      const actorRole = c.get("actorRole");
      const actorPermissions = c.get("actorPermissions") ?? [];
      const hasScope = await assertTenantInOwnerScope(db, actorId, rawTenantId, actorPermissions, actorRole);
      if (!hasScope) {
        return c.json({ error: "forbidden", message: "Access to this tenant is not permitted" }, 403);
      }
    }

    const subPath = c.req.path.replace(/^\/pms/, "");
    const method = c.req.method;
    const body =
      method === "GET" || method === "HEAD"
        ? undefined
        : await c.req.json().catch(() => undefined);

    const requestId = c.get("requestId");

    const { data, status } = await pmsProxyJson(subPath, method, {
      body,
      headers: buildInternalHeaders(rawTenantId),
      query: Object.fromEntries(new URL(c.req.url).searchParams.entries()),
      requestId,
    });
    return c.json(data, status as 200);
  });
}
