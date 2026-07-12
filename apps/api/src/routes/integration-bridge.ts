import { tenantDeployments, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { createDb } from "@repo/db";
import type { Hono } from "hono";
import { z } from "zod";
import { posProxyJson } from "../pos-proxy.js";
import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import {
  assertTenantModuleLicensed,
  respondModuleAccessDenied,
} from "../lib/tenant-module-access.js";
import { tenantWithinOwnerScope } from "./tenants-shared.js";

type Db = ReturnType<typeof createDb>;

const stockixTenantIdParam = z.string().uuid();

export function registerIntegrationBridgeRoutes(
  app: Hono<ControlPlaneAuthEnv>,
  db: Db | null,
): void {
  app.get("/tenants/:tenantId/integration/bridge-summary", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }

    if (!(await tenantWithinOwnerScope(db, c, tenantParsed.data))) {
      return c.json({ error: "tenant_not_found" }, 404);
    }

    const posAccess = await assertTenantModuleLicensed(db, tenantParsed.data, "pos");
    if (!posAccess.ok) return respondModuleAccessDenied(c, posAccess);
    const accountingAccess = await assertTenantModuleLicensed(db, tenantParsed.data, "accounting");
    if (!accountingAccess.ok) return respondModuleAccessDenied(c, accountingAccess);

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
