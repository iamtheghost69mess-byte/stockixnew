import type { Context, Hono } from "hono";



import type { ControlPlaneAuthEnv } from "../middleware/auth.js";

import { requireEnv } from "../lib/require-env.js";

import { getPosOrgByStockixTenantId, posProxyJson } from "../pos-proxy.js";

import {

  assertTenantModuleLicensed,

  respondModuleAccessDenied,

} from "../lib/tenant-module-access.js";

import type { createDb } from "@repo/db";

import { branchLocationMappings } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { canCreateLocation } from "../plan-limits.js";



type Db = ReturnType<typeof createDb>;



type PosProxyContext = Context<ControlPlaneAuthEnv>;



/**

 * When tenantId/stockixTenantId is present, require POS on that tenant.

 * Global platform POS routes (no tenantId) require super_admin.

 */

async function enforcePosModuleAccess(

  db: Db | null | undefined,

  c: PosProxyContext,

): Promise<Response | null> {

  if (!db) return null;



  const tenantId =

    c.req.query("tenantId")?.trim()

    ?? c.req.query("stockixTenantId")?.trim();



  if (tenantId) {

    const access = await assertTenantModuleLicensed(db, tenantId, "pos");

    if (!access.ok) return respondModuleAccessDenied(c, access);

    return null;

  }



  const role = c.get("actorRole");

  if (role !== "super_admin") {

    return c.json(

      {

        error: "forbidden",

        message:

          "POS platform routes require super_admin or a tenantId query parameter for a POS-licensed tenant",

      },

      403,

    );

  }



  return null;

}



async function withPosModuleAccess(

  db: Db | null | undefined,

  c: PosProxyContext,

  handler: () => Promise<Response>,

): Promise<Response> {

  const denied = await enforcePosModuleAccess(db, c);

  if (denied) return denied;

  return handler();

}



export function registerPosProxyRoutes(app: Hono<ControlPlaneAuthEnv>, db?: Db | null): void {

  app.get("/pos/tenant-org", async (c) => {

    return withPosModuleAccess(db, c, async () => {

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

      const requestId = c.get("requestId");

      const { data, status } = await getPosOrgByStockixTenantId(tenantId, requestId);

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/organizations", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson("/organizations", "GET", undefined, {

        page: c.req.query("page"),

        pageSize: c.req.query("pageSize"),

        search: c.req.query("search"),

      });

      return c.json(data, status as 200);

    });

  });



  app.post("/pos/organizations", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const body = await c.req.json().catch(() => ({}));

      const { data, status } = await posProxyJson("/organizations", "POST", body);

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/organizations/:id", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson(

        `/organizations/${c.req.param("id")}`,

        "GET",

      );

      return c.json(data, status as 200);

    });

  });



  app.patch("/pos/organizations/:id", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const body = await c.req.json().catch(() => ({}));

      const { data, status } = await posProxyJson(

        `/organizations/${c.req.param("id")}`,

        "PATCH",

        body,

      );

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/devices", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson("/devices", "GET", undefined, {

        page: c.req.query("page"),

        pageSize: c.req.query("pageSize"),

        organizationId: c.req.query("organizationId"),

      });

      return c.json(data, status as 200);

    });

  });



  app.post("/pos/devices/:id/approve", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson(

        `/devices/${c.req.param("id")}/approve`,

        "POST",

      );

      return c.json(data, status as 200);

    });

  });



  app.delete("/pos/devices/:id", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson(

        `/devices/${c.req.param("id")}`,

        "DELETE",

      );

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/metrics/summary", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson("/metrics/summary", "GET");

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/metrics/kpis", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson("/metrics/kpis", "GET");

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/flags", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson("/flags", "GET");

      return c.json(data, status as 200);

    });

  });



  app.patch("/pos/flags/:key", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const body = await c.req.json().catch(() => ({}));

      const { data, status } = await posProxyJson(

        `/flags/${c.req.param("key")}`,

        "PATCH",

        body,

      );

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/webhooks", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson("/webhooks/endpoints", "GET");

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/notifications", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson("/notifications", "GET");

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/jobs", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson("/jobs", "GET");

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/audits", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson("/audits", "GET");

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/compliance/export", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const { data, status } = await posProxyJson("/compliance/export", "GET");

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/locations", async (c) => {
    return withPosModuleAccess(db, c, async () => {
      const { data, status } = await posProxyJson("/locations", "GET", undefined, {
        page: c.req.query("page"),
        pageSize: c.req.query("pageSize"),
      });
      return c.json(data, status as 200);
    });
  });

  app.post("/pos/locations", async (c) => {
    return withPosModuleAccess(db, c, async () => {
      const tenantId =
        c.req.query("tenantId")?.trim() ??
        c.req.query("stockixTenantId")?.trim();

      if (tenantId && db) {
        const canCreate = await canCreateLocation(db, tenantId);
        if (!canCreate) {
          return c.json(
            { error: "max_locations_reached", message: "Maximum number of locations reached for current plan." },
            403,
          );
        }
      }

      const body = await c.req.json().catch(() => ({}));
      const { data, status } = await posProxyJson("/locations", "POST", body);

      // Task 2-B: Also insert the mapping if creation succeeds.
      if (status >= 200 && status < 300 && db && tenantId && data && (data as any)._id) {
        try {
          await db.insert(branchLocationMappings).values({
            tenantId,
            posLocationId: (data as any)._id,
            posOrganizationId: (data as any).organizationId ?? "",
          });
        } catch (err) {
          console.warn("[pos-proxy] failed to insert branchLocationMapping:", err);
        }
      }

      return c.json(data, status as 200);
    });
  });



  app.delete("/pos/locations/:id", async (c) => {

    return withPosModuleAccess(db, c, async () => {

      const locationId = c.req.param("id");

      const { data, status } = await posProxyJson(`/locations/${locationId}`, "DELETE");

      if (status >= 200 && status < 300 && db) {

        const tenantId =
          c.req.query("tenantId")?.trim() ??
          c.req.query("stockixTenantId")?.trim();

        if (tenantId) {

          await db
            .delete(branchLocationMappings)
            .where(
              and(
                eq(branchLocationMappings.posLocationId, locationId),
                eq(branchLocationMappings.tenantId, tenantId),
              ),
            ).catch((err: unknown) => {
              // Non-fatal — log only; the POS delete already succeeded.
              console.warn(
                `[pos-proxy] branchLocationMappings cleanup failed for posLocationId=${locationId}:`,
                err instanceof Error ? err.message : String(err),
              );
            });

        }

      }

      return c.json(data, status as 200);

    });

  });



  app.get("/pos/status", async (c) => {

    let base: string;

    let frontendUrl: string;

    try {

      base = requireEnv("POS_PLATFORM_BASE_URL", "http://localhost:8010");

      frontendUrl = requireEnv("POS_FRONTEND_URL", "http://localhost:3001");

    } catch (err) {

      const message = err instanceof Error ? err.message : String(err);

      return c.json({ configured: false, error: message }, 503);

    }

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

  app.get("/pos/staff", async (c) => {
    return withPosModuleAccess(db, c, async () => {
      const { data, status } = await posProxyJson("/staff", "GET", undefined, {
        page: c.req.query("page"),
        pageSize: c.req.query("pageSize"),
        organizationId: c.req.query("organizationId"),
      });
      return c.json(data, status as 200);
    });
  });

  app.patch("/pos/staff/:id", async (c) => {
    return withPosModuleAccess(db, c, async () => {
      const body = await c.req.json().catch(() => ({}));
      const { data, status } = await posProxyJson(
        `/staff/${c.req.param("id")}`,
        "PATCH",
        body,
      );
      return c.json(data, status as 200);
    });
  });
}

