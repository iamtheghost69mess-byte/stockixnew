import { apiConfig } from "@repo/config";
import { tenantDeployments, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";

import { createProvisionTracer } from "../domain/provision-trace.js";
import { activateFinanceWarehouses } from "../domain/provisioning/adapters/activate-finance-warehouses.js";
import { seedFinancePosDefaults } from "../domain/provisioning/adapters/seed-finance-pos-defaults.js";
import { wirePosBigcapitalIntegration } from "../domain/provisioning/adapters/wire-pos-bigcapital-integration.js";
import { syncFinanceLicense } from "../domain/provisioning/adapters/sync-finance-license.js";
import { getPlanLimits } from "@repo/platform-worker-shared";
import type { AddModuleInput, AddModuleResult } from "./provision-runtime.js";

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

/**
 * Add accounting to an existing tenant: seed Finance POS defaults and wire when POS org exists.
 * Requires Finance stack already provisioned (financeTenantId + internalPort on deployment).
 */
export async function executeAddAccountingModuleRuntime(
  db: PostgresJsDatabase<typeof dbSchema>,
  input: AddModuleInput,
  log: (m: string) => void,
  correlationId: string,
): Promise<AddModuleResult> {
  const trace = createProvisionTracer(
    db,
    correlationId,
    () => ({ slug: input.slug, tenantId: input.tenantId }),
    log,
  );

  const [row] = await db
    .select({
      deploymentId: tenantDeployments.id,
      internalPort: tenantDeployments.internalPort,
      financeTenantId: tenantDeployments.financeTenantId,
      financeDefaultWarehouseId: tenantDeployments.financeDefaultWarehouseId,
      financeWalkInCustomerId: tenantDeployments.financeWalkInCustomerId,
      financeCashAccountId: tenantDeployments.financeCashAccountId,
      financeCardAccountId: tenantDeployments.financeCardAccountId,
      posOrganizationId: tenantDeployments.posOrganizationId,
      modules: tenants.modules,
    })
    .from(tenants)
    .innerJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, input.tenantId))
    .limit(1);

  if (!row) {
    throw new Error(`tenant_not_found:${input.tenantId}`);
  }

  const financeTenantId = row.financeTenantId ?? undefined;
  const financeInternalPort = row.internalPort ?? undefined;
  const internalSecret = apiConfig.internalApiSecret?.trim() ?? "";

  if (!financeTenantId || !financeInternalPort || financeInternalPort <= 0) {
    throw new Error(
      "accounting_add_requires_finance_stack: provision Finance first via POST /tenants/:id/retry-provision with modules including accounting",
    );
  }

  const internalUrl = `http://${process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? "127.0.0.1"}:${financeInternalPort}`;

  let financeDefaultWarehouseId = row.financeDefaultWarehouseId ?? undefined;
  let walkInCustomerId = row.financeWalkInCustomerId ?? undefined;
  let cashAccountId = row.financeCashAccountId ?? undefined;
  let cardAccountId = row.financeCardAccountId ?? undefined;
  let serviceChargeItemId: number | undefined;
  let discountItemId: number | undefined;

  if (!financeDefaultWarehouseId || financeDefaultWarehouseId <= 0) {
    const wh = await activateFinanceWarehouses({
      internalBaseUrl: internalUrl,
      internalApiSecret: internalSecret,
      financeTenantId,
      correlationId,
      log,
    });
    financeDefaultWarehouseId = wh.primaryWarehouseId;
  }

  const seeded = await seedFinancePosDefaults({
    internalBaseUrl: internalUrl,
    internalApiSecret: internalSecret,
    financeTenantId,
    correlationId,
    log,
  });
  walkInCustomerId = walkInCustomerId ?? seeded.walkInCustomerId;
  cashAccountId = cashAccountId ?? seeded.cashAccountId;
  cardAccountId = cardAccountId ?? seeded.cardAccountId;
  serviceChargeItemId = seeded.serviceChargeItemId;
  discountItemId = seeded.discountItemId;

  await db
    .update(tenantDeployments)
    .set({
      financeDefaultWarehouseId,
      financeWalkInCustomerId: walkInCustomerId,
      financeCashAccountId: cashAccountId,
      financeCardAccountId: cardAccountId,
      updatedAt: new Date(),
    })
    .where(eq(tenantDeployments.id, row.deploymentId));

  const licensedModules = parseTenantModulesJson(row.modules);
  const posOrganizationId = row.posOrganizationId ?? undefined;

  if (licensedModules.includes("pos") && posOrganizationId) {
    const posHostPort = Number(process.env.POS_HOST_PORT ?? 8010);
    await trace.event("progress", "Wiring POS after accounting module add", {
      meta: { posOrganizationId, financeTenantId },
    });
    await wirePosBigcapitalIntegration({
      posOrganizationId,
      posHostPort,
      slug: input.slug,
      internalPort: financeInternalPort,
      workerInternalUrl: internalUrl,
      financeTenantId,
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
  }

  const planSlug = input.planSlug ?? "starter";
  const planLimits = await getPlanLimits(db, planSlug);
  await syncFinanceLicense(
    internalUrl,
    {
      tenantId: financeTenantId,
      planSlug,
      status: "active",
      isPerpetual: true,
      maxOrganizations: planLimits.maxOrganizations,
      maxActivations: planLimits.maxActivations,
      maxUsers: planLimits.maxUsers,
    },
    log,
  );

  return {
    ok: true,
    module: "accounting",
    tenantStatus: "active",
    posOrganizationId,
  };
}
