import { apiConfig } from "@repo/config";

/** Matches apps/api/src/finance-license.client.ts default staff cap. */
export const FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS = 999;

export type SyncFinanceLicensePayload = {
  tenantId: number;
  planSlug?: string;
  status?: "active" | "expired" | "suspended" | "grace";
  validFrom?: string;
  expiresAt?: string | null;
  gracePeriodDays?: number;
  maxUsers?: number;
  maxActivations?: number;
  maxOrganizations?: number;
  isPerpetual?: boolean;
  featureFlags?: Record<string, boolean> | null;
};

export async function syncFinanceLicense(
  internalBaseUrl: string,
  payload: SyncFinanceLicensePayload,
  log: (message: string) => void,
): Promise<void> {
  const secret = apiConfig.internalApiSecret;
  if (!secret) {
    log("[provision] INTERNAL_API_SECRET not set; skipping finance license sync");
    return;
  }

  const url = `${internalBaseUrl.replace(/\/+$/, "")}/api/internal/license/sync`;
  const body = {
    tenantId: payload.tenantId,
    planSlug: payload.planSlug ?? "owner-managed",
    status: payload.status ?? "active",
    validFrom: payload.validFrom ?? new Date().toISOString(),
    expiresAt: payload.expiresAt ?? null,
    gracePeriodDays: payload.gracePeriodDays ?? 30,
    maxUsers: payload.maxUsers ?? FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS,
    maxActivations: payload.maxActivations ?? 1,
    maxOrganizations: payload.maxOrganizations ?? 1,
    isPerpetual: payload.isPerpetual ?? true,
    featureFlags: payload.featureFlags ?? null,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text();
      log(`[provision] finance license sync failed: HTTP ${res.status} ${text.slice(0, 200)}`);
      return;
    }
    log(`[provision] finance license synced for tenant ${payload.tenantId}`);
  } catch (error) {
    log(
      `[provision] finance license sync error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
