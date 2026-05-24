import { parseFinanceApiJsonText } from "@repo/shared/finance-api";

export type ActivateFinanceWarehousesResult = {
  primaryWarehouseId: number;
  alreadyActivated: boolean;
};

/**
 * POST /api/internal/tenants/:tenantId/activate-warehouses
 * Creates primary warehouse (code 10001) when multi-warehouse is not yet active.
 */
export async function activateFinanceWarehouses(params: {
  internalBaseUrl: string;
  internalApiSecret: string;
  financeTenantId: number;
  correlationId?: string;
  log?: (message: string) => void;
}): Promise<ActivateFinanceWarehousesResult> {
  const base = params.internalBaseUrl.replace(/\/+$/, "");
  const url = `${base}/api/internal/tenants/${params.financeTenantId}/activate-warehouses`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": params.internalApiSecret,
      ...(params.correlationId ? { "x-request-id": params.correlationId } : {}),
    },
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  const body = parseFinanceApiJsonText(text);
  if (!res.ok) {
    const detail =
      typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : text.slice(0, 300);
    throw new Error(`activate_warehouses_failed:${res.status}:${detail}`);
  }
  const primaryWarehouseId = Number(body.primaryWarehouseId);
  if (!Number.isFinite(primaryWarehouseId) || primaryWarehouseId <= 0) {
    throw new Error("activate_warehouses_failed:missing_primaryWarehouseId");
  }
  params.log?.(
    `[provision] Warehouses activated tenant=${params.financeTenantId} warehouse=${primaryWarehouseId} already=${Boolean(body.alreadyActivated)}`,
  );
  return {
    primaryWarehouseId,
    alreadyActivated: Boolean(body.alreadyActivated),
  };
}
