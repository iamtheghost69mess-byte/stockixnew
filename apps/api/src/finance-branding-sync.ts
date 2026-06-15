import { apiConfig } from "@repo/config";
import { tenantDeployments } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { createDb } from "@repo/db";

import { resolveTenantInternalBaseUrl } from "./finance-license.client.js";

export async function syncTenantBrandingToFinance(
  db: ReturnType<typeof createDb>,
  params: {
    stockixTenantId: string;
    appName?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
  },
  log: (message: string) => void = () => {},
): Promise<void> {
  const secret = apiConfig.internalApiSecret;
  if (!secret) {
    log("[finance-branding] INTERNAL_API_SECRET not configured; skipping");
    return;
  }

  const [deployment] = await db
    .select({ financeTenantId: tenantDeployments.financeTenantId })
    .from(tenantDeployments)
    .where(eq(tenantDeployments.tenantId, params.stockixTenantId))
    .limit(1);

  const financeTenantId = deployment?.financeTenantId;
  if (!financeTenantId || financeTenantId <= 0) {
    log("[finance-branding] No financeTenantId; skipping branding sync");
    return;
  }

  const internalBaseUrl = await resolveTenantInternalBaseUrl(db, params.stockixTenantId);
  if (!internalBaseUrl) {
    log("[finance-branding] No internal base URL; skipping");
    return;
  }

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
    return;
  }

  log(`[finance-branding] Synced branding for finance tenant ${financeTenantId}`);
}
