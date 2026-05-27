import { apiConfig } from "@repo/config";
import type { Hono } from "hono";

import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import { requireEnv } from "../lib/require-env.js";
import { pmsProxyJson } from "../pms-proxy.js";

function proxyHeaders(c: {
  req: { header: (name: string) => string | undefined; query: (k: string) => string | undefined };
}): Record<string, string> {
  const headers: Record<string, string> = {};
  const secret = apiConfig.platformApiSecret;
  if (secret) {
    headers["x-stockix-internal-secret"] = secret;
  }
  const tenantId = c.req.query("tenantId");
  if (tenantId) {
    headers["x-stockix-tenant-id"] = tenantId;
  }
  return headers;
}

export function registerPmsProxyRoutes(app: Hono<ControlPlaneAuthEnv>): void {
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
    const subPath = c.req.path.replace(/^\/pms/, "");
    const method = c.req.method;
    const body =
      method === "GET" || method === "HEAD"
        ? undefined
        : await c.req.json().catch(() => undefined);
    const { data, status } = await pmsProxyJson(subPath, method, {
      body,
      headers: proxyHeaders(c),
      query: Object.fromEntries(
        new URL(c.req.url).searchParams.entries(),
      ),
    });
    return c.json(data, status as 200);
  });
}
