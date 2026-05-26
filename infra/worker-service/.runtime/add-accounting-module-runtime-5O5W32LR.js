import {
  activateFinanceWarehouses,
  apiConfig,
  createProvisionTracer,
  getPlanLimits,
  seedFinancePosDefaults,
  syncFinanceLicense,
  tenantDeployments,
  tenants,
  wirePosBigcapitalIntegration
} from "./chunk-OZPPGGSF.js";

// ../../infra/worker-service/src/add-accounting-module-runtime.ts
import { eq } from "drizzle-orm";
function parseTenantModulesJson(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((m) => typeof m === "string") : [];
  } catch {
    return [];
  }
}
async function executeAddAccountingModuleRuntime(db, input, log, correlationId) {
  const trace = createProvisionTracer(
    db,
    correlationId,
    () => ({ slug: input.slug, tenantId: input.tenantId }),
    log
  );
  const [row] = await db.select({
    deploymentId: tenantDeployments.id,
    internalPort: tenantDeployments.internalPort,
    financeTenantId: tenantDeployments.financeTenantId,
    financeDefaultWarehouseId: tenantDeployments.financeDefaultWarehouseId,
    financeWalkInCustomerId: tenantDeployments.financeWalkInCustomerId,
    financeCashAccountId: tenantDeployments.financeCashAccountId,
    financeCardAccountId: tenantDeployments.financeCardAccountId,
    posOrganizationId: tenantDeployments.posOrganizationId,
    modules: tenants.modules
  }).from(tenants).innerJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id)).where(eq(tenants.id, input.tenantId)).limit(1);
  if (!row) {
    throw new Error(`tenant_not_found:${input.tenantId}`);
  }
  const financeTenantId = row.financeTenantId ?? void 0;
  const financeInternalPort = row.internalPort ?? void 0;
  const internalSecret = apiConfig.internalApiSecret?.trim() ?? "";
  if (!financeTenantId || !financeInternalPort || financeInternalPort <= 0) {
    throw new Error(
      "accounting_add_requires_finance_stack: provision Finance first via POST /tenants/:id/retry-provision with modules including accounting"
    );
  }
  const internalUrl = `http://${process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? "127.0.0.1"}:${financeInternalPort}`;
  let financeDefaultWarehouseId = row.financeDefaultWarehouseId ?? void 0;
  let walkInCustomerId = row.financeWalkInCustomerId ?? void 0;
  let cashAccountId = row.financeCashAccountId ?? void 0;
  let cardAccountId = row.financeCardAccountId ?? void 0;
  let serviceChargeItemId;
  let discountItemId;
  if (!financeDefaultWarehouseId || financeDefaultWarehouseId <= 0) {
    const wh = await activateFinanceWarehouses({
      internalBaseUrl: internalUrl,
      internalApiSecret: internalSecret,
      financeTenantId,
      correlationId,
      log
    });
    financeDefaultWarehouseId = wh.primaryWarehouseId;
  }
  const seeded = await seedFinancePosDefaults({
    internalBaseUrl: internalUrl,
    internalApiSecret: internalSecret,
    financeTenantId,
    correlationId,
    log
  });
  walkInCustomerId = walkInCustomerId ?? seeded.walkInCustomerId;
  cashAccountId = cashAccountId ?? seeded.cashAccountId;
  cardAccountId = cardAccountId ?? seeded.cardAccountId;
  serviceChargeItemId = seeded.serviceChargeItemId;
  discountItemId = seeded.discountItemId;
  await db.update(tenantDeployments).set({
    financeDefaultWarehouseId,
    financeWalkInCustomerId: walkInCustomerId,
    financeCashAccountId: cashAccountId,
    financeCardAccountId: cardAccountId,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq(tenantDeployments.id, row.deploymentId));
  const licensedModules = parseTenantModulesJson(row.modules);
  const posOrganizationId = row.posOrganizationId ?? void 0;
  if (licensedModules.includes("pos") && posOrganizationId) {
    const posHostPort = Number(process.env.POS_HOST_PORT ?? 8010);
    await trace.event("progress", "Wiring POS after accounting module add", {
      meta: { posOrganizationId, financeTenantId }
    });
    await wirePosBigcapitalIntegration({
      posOrganizationId,
      posHostPort,
      slug: input.slug,
      internalPort: financeInternalPort,
      workerInternalUrl: internalUrl,
      financeTenantId,
      walkInCustomerId,
      cashAccountId,
      cardAccountId,
      serviceChargeItemId,
      discountItemId,
      defaultWarehouseId: financeDefaultWarehouseId,
      defaultVendorId: seeded.defaultVendorId,
      inventoryAccountId: seeded.inventoryAccountId,
      inventoryVarianceAccountId: seeded.inventoryVarianceAccountId,
      log
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
      maxUsers: planLimits.maxUsers
    },
    log
  );
  return {
    ok: true,
    module: "accounting",
    tenantStatus: "active",
    posOrganizationId
  };
}
export {
  executeAddAccountingModuleRuntime
};
//# sourceMappingURL=add-accounting-module-runtime-5O5W32LR.js.map