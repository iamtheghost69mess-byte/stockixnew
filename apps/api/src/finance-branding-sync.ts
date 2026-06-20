import { apiConfig } from "@repo/config";
import { tenantDeployments } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { createDb } from "@repo/db";

import { resolveTenantInternalBaseUrl } from "./finance-license.client.js";

export async function syncOrganizationNameToFinance(
  db: ReturnType<typeof createDb>,
  params: {
    stockixTenantId: string;
    financeOrganizationId: string;
    name: string;
  },
  log: (message: string) => void = () => {},
): Promise<{ synced: boolean; warning?: string }> {
  const secret = apiConfig.internalApiSecret;
  if (!secret) {
    log("[finance-org-rename] INTERNAL_API_SECRET not configured; skipping");
    return { synced: false, warning: "INTERNAL_API_SECRET not configured — name not synced to Finance." };
  }

  const internalBaseUrl = await resolveTenantInternalBaseUrl(db, params.stockixTenantId);
  if (!internalBaseUrl) {
    log("[finance-org-rename] No internal base URL; skipping");
    return { synced: false, warning: "Finance stack is unreachable — name saved but not synced." };
  }

  try {
    const url = `${internalBaseUrl.replace(/\/+$/, "")}/api/internal/organization/branding/sync`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({
        tenantId: params.financeOrganizationId,
        name: params.name,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text();
      log(`[finance-org-rename] Sync failed HTTP ${res.status}: ${text.slice(0, 200)}`);
      return { synced: false, warning: `Finance sync failed (HTTP ${res.status}) — name saved but not reflected in Finance yet.` };
    }

    log(`[finance-org-rename] Synced name for finance organization ${params.financeOrganizationId}`);
    return { synced: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[finance-org-rename] Sync error: ${msg}`);
    return { synced: false, warning: "Finance stack timed out — name saved but not synced yet." };
  }
}

export async function syncTenantBrandingToFinance(
  db: ReturnType<typeof createDb>,
  params: {
    stockixTenantId: string;
    appName?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
  },
  log: (message: string) => void = () => {},
): Promise<{ synced: boolean; warning?: string }> {
  const secret = apiConfig.internalApiSecret;
  if (!secret) {
    log("[finance-branding] INTERNAL_API_SECRET not configured; skipping");
    return { synced: false, warning: "INTERNAL_API_SECRET not configured — branding not synced to Finance." };
  }

  const [deployment] = await db
    .select({ financeTenantId: tenantDeployments.financeTenantId })
    .from(tenantDeployments)
    .where(eq(tenantDeployments.tenantId, params.stockixTenantId))
    .limit(1);

  const financeTenantId = deployment?.financeTenantId;
  if (!financeTenantId || financeTenantId <= 0) {
    log("[finance-branding] No financeTenantId; skipping branding sync");
    return { synced: false, warning: "Tenant has no Finance deployment — branding saved but not synced." };
  }

  const internalBaseUrl = await resolveTenantInternalBaseUrl(db, params.stockixTenantId);
  if (!internalBaseUrl) {
    log("[finance-branding] No internal base URL; skipping");
    return { synced: false, warning: "Finance stack is unreachable — branding saved but not synced." };
  }

  try {
    const url = `${internalBaseUrl.replace(/\/+$/, "")}/api/internal/organization/branding/sync`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({
        tenantId: financeTenantId,
        name: params.appName ?? undefined,
        logoUrl: params.logoUrl ?? null,
        primaryColor: params.primaryColor ?? null,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text();
      log(`[finance-branding] Sync failed HTTP ${res.status}: ${text.slice(0, 200)}`);
      return { synced: false, warning: `Finance sync failed (HTTP ${res.status}) — branding saved but not reflected in Finance yet.` };
    }

    log(`[finance-branding] Synced branding for finance tenant ${financeTenantId}`);
    return { synced: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[finance-branding] Sync error: ${msg}`);
    return { synced: false, warning: "Finance stack timed out — branding saved but not synced yet." };
  }
}
