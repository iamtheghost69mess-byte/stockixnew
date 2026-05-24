import { tenantDeployments, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import { parseLicenseModulesJson } from "./license-utils.js";
import { posProxyJson } from "./pos-proxy.js";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Suspend the linked POS organization when Stockix license is revoked or expired.
 * Non-fatal: logs and returns on missing POS link or proxy failure.
 */
export async function suspendPosOrgForLicense(
  db: Db,
  tenantId: string,
  reason: string,
  log?: (message: string) => void,
): Promise<void> {
  const [row] = await db
    .select({
      modules: tenants.modules,
      posOrganizationId: tenantDeployments.posOrganizationId,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const posOrgId = row?.posOrganizationId?.trim();
  if (!posOrgId) return;

  const modules = parseLicenseModulesJson(row?.modules);
  if (!modules.includes("pos")) return;

  const { data, status } = await posProxyJson(
    `/organizations/${encodeURIComponent(posOrgId)}/suspend`,
    "POST",
    { reason },
  );

  if (status < 200 || status >= 300) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message)
        : `HTTP ${status}`;
    const line = `[pos-license-sync] suspend failed tenantId=${tenantId} posOrgId=${posOrgId}: ${message}`;
    if (log) log(line);
    else console.error(line);
    return;
  }

  const okLine = `[pos-license-sync] suspended POS org tenantId=${tenantId} posOrgId=${posOrgId} reason=${reason}`;
  if (log) log(okLine);
  else console.log(okLine);
}
