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

export class FinanceLicenseSyncError extends Error {
  readonly code = "FINANCE_LICENSE_SYNC_FAILED" as const;

  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = "FinanceLicenseSyncError";
  }
}

/** When true, missing secret or HTTP failure is logged but does not throw (development only). */
export function isFinanceLicenseSyncOptional(): boolean {
  const flag = process.env.FINANCE_LICENSE_SYNC_OPTIONAL?.trim().toLowerCase();
  if (flag === "1" || flag === "true") {
    return apiConfig.nodeEnv === "development";
  }
  return false;
}

export async function syncFinanceLicense(
  internalBaseUrl: string,
  payload: SyncFinanceLicensePayload,
  log: (message: string) => void,
): Promise<void> {
  const secret = apiConfig.internalApiSecret;
  if (!secret) {
    const msg = "INTERNAL_API_SECRET is not set; finance license sync is required for accounting tenants";
    if (isFinanceLicenseSyncOptional()) {
      log(`[provision] ${msg} (FINANCE_LICENSE_SYNC_OPTIONAL=1 — skipping)`);
      return;
    }
    throw new FinanceLicenseSyncError(msg);
  }

  if (
    typeof payload.maxOrganizations !== "number" ||
    typeof payload.maxActivations !== "number"
  ) {
    throw new FinanceLicenseSyncError(
      "maxOrganizations and maxActivations are required on finance license sync payload",
    );
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
    maxActivations: payload.maxActivations,
    maxOrganizations: payload.maxOrganizations,
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
      const detail = `HTTP ${res.status} ${text.slice(0, 200)}`;
      log(`[provision] finance license sync failed: ${detail}`);
      if (isFinanceLicenseSyncOptional()) {
        log("[provision] FINANCE_LICENSE_SYNC_OPTIONAL=1 — continuing despite sync failure");
        return;
      }
      throw new FinanceLicenseSyncError(
        `Finance license sync failed for tenant ${payload.tenantId}`,
        detail,
      );
    }
    log(`[provision] finance license synced for tenant ${payload.tenantId}`);
  } catch (error) {
    if (error instanceof FinanceLicenseSyncError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    log(`[provision] finance license sync error: ${detail}`);
    if (isFinanceLicenseSyncOptional()) {
      log("[provision] FINANCE_LICENSE_SYNC_OPTIONAL=1 — continuing despite sync error");
      return;
    }
    throw new FinanceLicenseSyncError(
      `Finance license sync error for tenant ${payload.tenantId}`,
      detail,
    );
  }
}
