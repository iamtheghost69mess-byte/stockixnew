import { tenantDeployments, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Hono } from "hono";
import { z } from "zod";
import * as schema from "@repo/db/schema";
import { posProxyJson } from "./pos-proxy.js";

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    requestId: string;
    requestStartMs: number;
  };
};

type Db = PostgresJsDatabase<typeof schema>;

const stockixTenantIdParam = z.string().uuid();

export function registerIntegrationBridgeRoutes(app: Hono<ApiEnv>, db: Db | null): void {
  app.get("/tenants/:tenantId/integration/bridge-summary", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }

    const [row] = await db
      .select({
        posOrganizationId: tenantDeployments.posOrganizationId,
      })
      .from(tenants)
      .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
      .where(eq(tenants.id, tenantParsed.data))
      .limit(1);

    if (!row) {
      return c.json({ error: "tenant_not_found" }, 404);
    }

    const posOrgId = row.posOrganizationId?.trim();
    if (!posOrgId) {
      return c.json(
        {
          error: "pos_org_not_linked",
          message: "Tenant has no POS organization id. Complete provisioning first.",
        },
        503,
      );
    }

    const proxied = await posProxyJson(
      `/organizations/${encodeURIComponent(posOrgId)}/integration/bridge-summary`,
      "GET",
    );

    return c.json(proxied.data, proxied.status as 200 | 404 | 503);
  });
}
