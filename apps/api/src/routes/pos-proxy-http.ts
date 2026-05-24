import { getPosOrgByStockixTenantId, posProxyJson } from "../pos-proxy.js";
import type { registerLicenseApi } from "../license-http.js";

export function registerPosProxyRoutes(
  app: Parameters<typeof registerLicenseApi>[0],
): void {
  app.get("/pos/tenant-org", async (c) => {
    const tenantId =
      c.req.query("tenantId")?.trim()
      || c.req.query("stockixTenantId")?.trim()
      || "";
    if (!tenantId) {
      return c.json(
        { error: "invalid_query", message: "tenantId or stockixTenantId is required" },
        400,
      );
    }
    const { data, status } = await getPosOrgByStockixTenantId(tenantId);
    return c.json(data, status as 200);
  });

  app.get("/pos/organizations", async (c) => {
    const { data, status } = await posProxyJson("/organizations", "GET", undefined, {
      page: c.req.query("page"),
      pageSize: c.req.query("pageSize"),
      search: c.req.query("search"),
    });
    return c.json(data, status as 200);
  });

  app.post("/pos/organizations", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { data, status } = await posProxyJson("/organizations", "POST", body);
    return c.json(data, status as 200);
  });

  app.get("/pos/organizations/:id", async (c) => {
    const { data, status } = await posProxyJson(
      `/organizations/${c.req.param("id")}`,
      "GET",
    );
    return c.json(data, status as 200);
  });

  app.patch("/pos/organizations/:id", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { data, status } = await posProxyJson(
      `/organizations/${c.req.param("id")}`,
      "PATCH",
      body,
    );
    return c.json(data, status as 200);
  });

  app.get("/pos/devices", async (c) => {
    const { data, status } = await posProxyJson("/devices", "GET", undefined, {
      page: c.req.query("page"),
      pageSize: c.req.query("pageSize"),
      organizationId: c.req.query("organizationId"),
    });
    return c.json(data, status as 200);
  });

  app.post("/pos/devices/:id/approve", async (c) => {
    const { data, status } = await posProxyJson(
      `/devices/${c.req.param("id")}/approve`,
      "POST",
    );
    return c.json(data, status as 200);
  });

  app.delete("/pos/devices/:id", async (c) => {
    const { data, status } = await posProxyJson(
      `/devices/${c.req.param("id")}`,
      "DELETE",
    );
    return c.json(data, status as 200);
  });

  app.get("/pos/metrics/summary", async (c) => {
    const { data, status } = await posProxyJson("/metrics/summary", "GET");
    return c.json(data, status as 200);
  });

  app.get("/pos/metrics/kpis", async (c) => {
    const { data, status } = await posProxyJson("/metrics/kpis", "GET");
    return c.json(data, status as 200);
  });

  app.get("/pos/flags", async (c) => {
    const { data, status } = await posProxyJson("/flags", "GET");
    return c.json(data, status as 200);
  });

  app.patch("/pos/flags/:key", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { data, status } = await posProxyJson(
      `/flags/${c.req.param("key")}`,
      "PATCH",
      body,
    );
    return c.json(data, status as 200);
  });

  app.get("/pos/webhooks", async (c) => {
    const { data, status } = await posProxyJson("/webhooks/endpoints", "GET");
    return c.json(data, status as 200);
  });

  app.get("/pos/notifications", async (c) => {
    const { data, status } = await posProxyJson("/notifications", "GET");
    return c.json(data, status as 200);
  });

  app.get("/pos/jobs", async (c) => {
    const { data, status } = await posProxyJson("/jobs", "GET");
    return c.json(data, status as 200);
  });

  app.get("/pos/audits", async (c) => {
    const { data, status } = await posProxyJson("/audits", "GET");
    return c.json(data, status as 200);
  });

  app.get("/pos/compliance/export", async (c) => {
    const { data, status } = await posProxyJson("/compliance/export", "GET");
    return c.json(data, status as 200);
  });

  app.get("/pos/status", async (c) => {
    const base = process.env.POS_PLATFORM_BASE_URL ?? "http://localhost:8010";
    const frontendUrl = process.env.POS_FRONTEND_URL ?? "http://localhost:3001";
    let reachable = false;
    let pingError: string | undefined;
    try {
      // pos-backend mounts `routes/healthRoute` at `/health` (not Nest `/api/ping`).
      const res = await fetch(`${base.replace(/\/+$/, "")}/health`, {
        signal: AbortSignal.timeout(4_000),
      });
      reachable = res.ok;
      if (!reachable) pingError = `HTTP ${res.status}`;
    } catch (err) {
      pingError = err instanceof Error ? err.message : String(err);
    }
    return c.json({
      configured: base.length > 0,
      reachable,
      baseUrl: base,
      frontendUrl,
      ...(pingError ? { pingError } : {}),
    });
  });
}
