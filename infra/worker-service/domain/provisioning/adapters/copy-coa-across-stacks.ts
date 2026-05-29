import { parseFinanceApiJsonText } from "@repo/shared/finance-api";

export type CopyCoaAcrossStacksParams = {
  parentInternalUrl: string;
  childInternalUrl: string;
  parentTenantId: number;
  childTenantId: number;
  internalSecret: string;
  correlationId?: string;
  log?: (message: string) => void;
};

function normalizeFinanceBase(url: string): string {
  return url.replace(/\/+$/, "");
}

async function resolveParentFinanceTenantId(params: {
  parentInternalUrl: string;
  adminEmail: string;
  internalSecret: string;
  correlationId?: string;
}): Promise<number | null> {
  const base = normalizeFinanceBase(params.parentInternalUrl);
  const url = `${base}/api/internal/resolve-tenant?email=${encodeURIComponent(params.adminEmail)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-internal-secret": params.internalSecret,
      ...(params.correlationId ? { "x-request-id": params.correlationId } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return null;
  }
  const body = parseFinanceApiJsonText(await res.text());
  const tenantId = Number(body.tenantId ?? body.tenant_id);
  return Number.isFinite(tenantId) && tenantId > 0 ? tenantId : null;
}

/**
 * Copies chart of accounts from a parent Finance stack to a child stack via internal export/import.
 * Non-fatal: callers should wrap in try/catch and log warnings on failure.
 */
export async function copyCoaAcrossStacks(
  params: CopyCoaAcrossStacksParams & { adminEmail?: string },
): Promise<{
  accountsCopied: number;
  taxRatesCopied: number;
  settingsCopied: number;
}> {
  const parentBase = normalizeFinanceBase(params.parentInternalUrl);
  const childBase = normalizeFinanceBase(params.childInternalUrl);

  let parentTenantId = params.parentTenantId;
  if ((!parentTenantId || parentTenantId <= 0) && params.adminEmail) {
    const resolved = await resolveParentFinanceTenantId({
      parentInternalUrl: parentBase,
      adminEmail: params.adminEmail,
      internalSecret: params.internalSecret,
      correlationId: params.correlationId,
    });
    if (resolved) {
      parentTenantId = resolved;
      params.log?.(`[provision] Resolved parent financeTenantId=${parentTenantId}`);
    }
  }

  if (!parentTenantId || parentTenantId <= 0) {
    throw new Error("copy_coa_failed:missing_parent_tenant_id");
  }
  if (!params.childTenantId || params.childTenantId <= 0) {
    throw new Error("copy_coa_failed:missing_child_tenant_id");
  }

  const exportUrl = `${parentBase}/api/internal/tenants/${parentTenantId}/export-chart-of-accounts`;
  const exportRes = await fetch(exportUrl, {
    method: "GET",
    headers: {
      "x-internal-secret": params.internalSecret,
      ...(params.correlationId ? { "x-request-id": params.correlationId } : {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  const exportText = await exportRes.text();
  if (!exportRes.ok) {
    throw new Error(
      `copy_coa_export_failed:${exportRes.status}:${exportText.slice(0, 200)}`,
    );
  }
  const exported = parseFinanceApiJsonText(exportText);
  const accounts = Array.isArray(exported.accounts) ? exported.accounts : [];
  const taxRates = Array.isArray(exported.taxRates)
    ? exported.taxRates
    : Array.isArray(exported.tax_rates)
      ? exported.tax_rates
      : [];
  const settings = Array.isArray(exported.settings) ? exported.settings : [];

  params.log?.(
    `[provision] Exported COA from parent tenant=${parentTenantId} accounts=${accounts.length} taxRates=${taxRates.length}`,
  );

  const importUrl = `${childBase}/api/internal/tenants/${params.childTenantId}/import-chart-of-accounts`;
  const importRes = await fetch(importUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": params.internalSecret,
      ...(params.correlationId ? { "x-request-id": params.correlationId } : {}),
    },
    body: JSON.stringify({ accounts, taxRates, settings }),
    signal: AbortSignal.timeout(120_000),
  });
  const importText = await importRes.text();
  const imported = parseFinanceApiJsonText(importText);
  if (!importRes.ok) {
    throw new Error(
      `copy_coa_import_failed:${importRes.status}:${importText.slice(0, 200)}`,
    );
  }

  const accountsCopied = Number(imported.accountsCopied ?? imported.accounts_copied ?? 0);
  const taxRatesCopied = Number(imported.taxRatesCopied ?? imported.tax_rates_copied ?? 0);
  const settingsCopied = Number(imported.settingsCopied ?? imported.settings_copied ?? 0);

  params.log?.(
    `[provision] Cross-stack COA copy ok child=${params.childTenantId} accounts=${accountsCopied} tax=${taxRatesCopied} settings=${settingsCopied}`,
  );

  return { accountsCopied, taxRatesCopied, settingsCopied };
}

export function isSeparateStackSubOrg(params: {
  parentTenantSlug?: string;
  mainTenantInternalBaseUrl?: string;
  childInternalUrl?: string;
}): boolean {
  const parentSlug = params.parentTenantSlug?.trim();
  const mainBase = params.mainTenantInternalBaseUrl?.trim();
  const childBase = params.childInternalUrl?.trim();
  if (!parentSlug || !mainBase || !childBase) {
    return false;
  }
  return normalizeFinanceBase(mainBase) !== normalizeFinanceBase(childBase);
}
