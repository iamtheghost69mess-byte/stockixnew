import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { tenantDeployments, tenants } from "@repo/db/schema";
import * as dbSchema from "@repo/db/schema";

import { createProvisionTracer } from "../provision-trace.js";
import { hasAccountingAndPos } from "../../src/module-stacks.js";
import { bootstrapPosOrganizationForControlPlane } from "./adapters/bootstrap-pos-org.js";
import { wirePosBigcapitalIntegration } from "./adapters/wire-pos-bigcapital-integration.js";
import { seedFinancePosDefaults } from "./adapters/seed-finance-pos-defaults.js";
import { activateFinanceWarehouses } from "./adapters/activate-finance-warehouses.js";
import { apiConfig } from "@repo/config";

export type CombinedOrgPosProvisionInput = {
  controlPlaneOrganizationId: string;
  organizationSlug: string;
  orgName: string;
  stockixTenantId: string;
  parentTenantSlug: string;
  financeInternalBaseUrl: string;
  financeTenantId: number;
  adminEmail: string;
  correlationId: string;
};

function parseTenantModulesJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((m): m is string => typeof m === "string")
      : [];
  } catch {
    return [];
  }
}

async function persistPosOrgOnControlPlane(
  controlPlaneOrgId: string,
  posOrganizationId: string,
  log: (m: string) => void,
): Promise<void> {
  const apiBase = `http://localhost:${apiConfig.port}`;
  const saveUrl = `${apiBase}/internal/organizations/${controlPlaneOrgId}`;
  const secret = apiConfig.workerSecret;
  const saveRes = await fetch(saveUrl, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ posOrganizationId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!saveRes.ok) {
    const text = await saveRes.text();
    throw new Error(
      `patch_control_plane_pos_org_http_${saveRes.status}: ${text.slice(0, 200)}`,
    );
  }
  log("[org-provision] Saved posOrganizationId on control-plane organization");
}

/**
 * After Finance sub-org provision: create POS org + wire integration (combined tenants).
 */
export async function provisionCombinedPosForOrganization(
  db: PostgresJsDatabase<typeof dbSchema>,
  input: CombinedOrgPosProvisionInput,
  log: (m: string) => void,
): Promise<{ posOrganizationId?: string; wired: boolean }> {
  const [tenantRow] = await db
    .select({
      modules: tenants.modules,
      name: tenants.name,
      adminEmail: tenants.adminEmail,
      planSlug: tenants.planSlug,
      posOrganizationId: tenantDeployments.posOrganizationId,
      internalPort: tenantDeployments.internalPort,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, input.stockixTenantId))
    .limit(1);

  if (!tenantRow) {
    log("[org-provision] Combined POS skipped — tenant not found");
    return { wired: false };
  }

  const licensedModules = parseTenantModulesJson(tenantRow.modules);
  if (!hasAccountingAndPos(licensedModules)) {
    log("[org-provision] Combined POS skipped — tenant is not accounting+pos");
    return { wired: false };
  }

  const trace = createProvisionTracer(
    db,
    input.correlationId,
    () => ({ slug: input.parentTenantSlug, tenantId: input.stockixTenantId }),
    log,
  );

  const posHostPort = Number(process.env.POS_HOST_PORT ?? 8010);
  const internalSecret = apiConfig.internalApiSecret?.trim() ?? "";
  if (!internalSecret) {
    throw new Error("INTERNAL_API_SECRET required for combined org POS wire");
  }

  let walkInCustomerId: number | undefined;
  let cashAccountId: number | undefined;
  let cardAccountId: number | undefined;
  let serviceChargeItemId: number | undefined;
  let discountItemId: number | undefined;
  let financeDefaultWarehouseId: number | undefined;

  const wh = await activateFinanceWarehouses({
    internalBaseUrl: input.financeInternalBaseUrl,
    internalApiSecret: internalSecret,
    financeTenantId: input.financeTenantId,
    correlationId: input.correlationId,
    log,
  });
  financeDefaultWarehouseId = wh.primaryWarehouseId;

  const seeded = await seedFinancePosDefaults({
    internalBaseUrl: input.financeInternalBaseUrl,
    internalApiSecret: internalSecret,
    financeTenantId: input.financeTenantId,
    correlationId: input.correlationId,
    log,
  });
  walkInCustomerId = seeded.walkInCustomerId;
  cashAccountId = seeded.cashAccountId;
  cardAccountId = seeded.cardAccountId;
  serviceChargeItemId = seeded.serviceChargeItemId;
  discountItemId = seeded.discountItemId;

  const posResult = await bootstrapPosOrganizationForControlPlane({
    slug: input.parentTenantSlug,
    tenantName: input.orgName,
    tenantId: input.stockixTenantId,
    adminEmail: input.adminEmail,
    controlPlaneOrganizationId: input.controlPlaneOrganizationId,
    organizationSlug: input.organizationSlug,
    tenantModules: licensedModules,
    posHostPort,
    log,
  });

  await persistPosOrgOnControlPlane(
    input.controlPlaneOrganizationId,
    posResult.posOrganizationId,
    log,
  );

  await trace.event("progress", "Wiring POS Bigcapital integration for control-plane org", {
    meta: {
      posOrganizationId: posResult.posOrganizationId,
      financeTenantId: input.financeTenantId,
    },
  });

  await wirePosBigcapitalIntegration({
    posOrganizationId: posResult.posOrganizationId,
    posHostPort,
    slug: input.parentTenantSlug,
    internalPort: tenantRow.internalPort ?? 80,
    workerInternalUrl: input.financeInternalBaseUrl,
    financeTenantId: input.financeTenantId,
    walkInCustomerId: walkInCustomerId!,
    cashAccountId: cashAccountId!,
    cardAccountId: cardAccountId!,
    serviceChargeItemId,
    discountItemId,
    defaultWarehouseId: financeDefaultWarehouseId,
    defaultVendorId: seeded.defaultVendorId,
    inventoryAccountId: seeded.inventoryAccountId,
    inventoryVarianceAccountId: seeded.inventoryVarianceAccountId,
    log,
  });

  log(
    `[org-provision] Combined POS org ${posResult.posOrganizationId} wired to Finance tenant ${input.financeTenantId}`,
  );

  return { posOrganizationId: posResult.posOrganizationId, wired: true };
}
