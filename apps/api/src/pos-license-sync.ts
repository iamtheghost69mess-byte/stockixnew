import { tenantDeployments, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import { parseLicenseModulesJson } from "./license-utils.js";
import { posProxyJson } from "./pos-proxy.js";

type Db = PostgresJsDatabase<typeof schema>;

export type PosSyncResult = { ok: true } | { ok: false; error: string };

export type PosLicenseMetadataPayload = {
  licenseKey?: string | null;
  stockixTenantId?: string | null;
  licenseKeyFormat?: string | null;
  acceptStkxUntil?: Date | string | null;
  scopedLocationId?: string | null;
};

type PosTenantLink = {
  posOrgId: string;
  modules: ReturnType<typeof parseLicenseModulesJson>;
};

type LicenseWindowSource = {
  isPerpetual: boolean;
  expiresAt: Date | null;
  validFrom?: Date | null;
  activatedAt?: Date | null;
  licenseKey?: string | null;
  keyFormat?: string | null;
  scopedLocationId?: string | null;
};

/** Resolve POS org license window dates from a Stockix license row. */
export function resolveLicenseWindowDates(license: LicenseWindowSource): {
  startsAt: Date;
  endsAt: Date;
} {
  const startsAt = license.validFrom ?? license.activatedAt ?? new Date();
  if (license.isPerpetual) {
    const endsAt = new Date(startsAt);
    endsAt.setUTCFullYear(endsAt.getUTCFullYear() + 100);
    return { startsAt, endsAt };
  }
  return {
    startsAt,
    endsAt: license.expiresAt ?? new Date(),
  };
}

function proxyErrorMessage(
  data: unknown,
  status: number,
): string {
  if (data && typeof data === "object" && "message" in data) {
    return String((data as { message?: unknown }).message);
  }
  return `HTTP ${status}`;
}

async function getPosTenantLink(
  db: Db,
  tenantId: string,
): Promise<PosTenantLink | null> {
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
  if (!posOrgId) return null;

  const modules = parseLicenseModulesJson(row?.modules);
  if (!modules.includes("pos")) return null;

  return { posOrgId, modules };
}

function logPosSyncLine(
  line: string,
  log?: (message: string) => void,
): void {
  if (log) log(line);
  else if (line.includes("failed")) console.error(line);
  else console.log(line);
}

/**
 * Push Stockix license window dates to the linked POS organization.
 */
export async function syncPosOrgLicenseWindow(
  db: Db,
  tenantId: string,
  window: { startsAt?: Date; endsAt?: Date },
  log?: (message: string) => void,
): Promise<PosSyncResult> {
  const link = await getPosTenantLink(db, tenantId);
  if (!link) return { ok: true };

  const payload: Record<string, string> = {};
  if (window.startsAt) payload.licenseStartsAt = window.startsAt.toISOString();
  if (window.endsAt) payload.licenseEndsAt = window.endsAt.toISOString();
  if (Object.keys(payload).length === 0) return { ok: true };

  const { data, status } = await posProxyJson(
    `/organizations/${encodeURIComponent(link.posOrgId)}/license`,
    "PATCH",
    payload,
  );

  if (status < 200 || status >= 300) {
    const message = proxyErrorMessage(data, status);
    logPosSyncLine(
      `[pos-license-sync] license window sync failed tenantId=${tenantId} posOrgId=${link.posOrgId}: ${message}`,
      log,
    );
    return { ok: false, error: message };
  }

  logPosSyncLine(
    `[pos-license-sync] synced POS license window tenantId=${tenantId} posOrgId=${link.posOrgId}`,
    log,
  );
  return { ok: true };
}

/** Push license key metadata (STXI/STKX) to the linked POS organization. */
export async function syncPosOrgLicenseMetadata(
  db: Db,
  tenantId: string,
  metadata: PosLicenseMetadataPayload,
  log?: (message: string) => void,
): Promise<PosSyncResult> {
  const link = await getPosTenantLink(db, tenantId);
  if (!link) return { ok: true };

  const payload: Record<string, string | null> = {};
  if (metadata.licenseKey !== undefined) {
    payload.licenseKey = metadata.licenseKey?.trim() || null;
  }
  if (metadata.stockixTenantId !== undefined) {
    payload.stockixTenantId = metadata.stockixTenantId?.trim() || null;
  }
  if (metadata.licenseKeyFormat !== undefined) {
    payload.licenseKeyFormat = metadata.licenseKeyFormat?.trim() || null;
  }
  if (metadata.scopedLocationId !== undefined) {
    payload.scopedLocationId = metadata.scopedLocationId?.trim() || null;
  }
  if (metadata.acceptStkxUntil !== undefined) {
    const v = metadata.acceptStkxUntil;
    payload.acceptStkxUntil =
      v == null ? null : v instanceof Date ? v.toISOString() : String(v);
  }

  if (Object.keys(payload).length === 0) return { ok: true };

  const { data, status } = await posProxyJson(
    `/organizations/${encodeURIComponent(link.posOrgId)}/license`,
    "PATCH",
    payload,
  );

  if (status < 200 || status >= 300) {
    const message = proxyErrorMessage(data, status);
    logPosSyncLine(
      `[pos-license-sync] license metadata sync failed tenantId=${tenantId} posOrgId=${link.posOrgId}: ${message}`,
      log,
    );
    return { ok: false, error: message };
  }

  logPosSyncLine(
    `[pos-license-sync] synced POS license metadata tenantId=${tenantId} posOrgId=${link.posOrgId}`,
    log,
  );
  return { ok: true };
}

/** Sync POS org window + optional metadata from a Stockix license row. */
export async function syncPosOrgLicenseFromLicense(
  db: Db,
  tenantId: string,
  license: LicenseWindowSource,
  log?: (message: string) => void,
): Promise<PosSyncResult> {
  const { startsAt, endsAt } = resolveLicenseWindowDates(license);
  const windowResult = await syncPosOrgLicenseWindow(db, tenantId, { startsAt, endsAt }, log);
  if (!windowResult.ok) return windowResult;

  const hasMetadata =
    license.licenseKey != null ||
    license.keyFormat != null ||
    license.scopedLocationId != null;

  if (!hasMetadata) return { ok: true };

  return syncPosOrgLicenseMetadata(
    db,
    tenantId,
    {
      licenseKey: license.licenseKey ?? null,
      stockixTenantId: tenantId,
      licenseKeyFormat: license.keyFormat ?? null,
      scopedLocationId: license.scopedLocationId ?? null,
    },
    log,
  );
}

/** Reactivate a suspended POS org after license extend/reactivate. */
export async function reactivatePosOrgForLicense(
  db: Db,
  tenantId: string,
  log?: (message: string) => void,
): Promise<PosSyncResult> {
  const link = await getPosTenantLink(db, tenantId);
  if (!link) return { ok: true };

  const { data, status } = await posProxyJson(
    `/organizations/${encodeURIComponent(link.posOrgId)}/lifecycle`,
    "PATCH",
    { lifecycle: "active", lifecycleReasonCode: "license_reactivated" },
  );

  if (status < 200 || status >= 300) {
    const message = proxyErrorMessage(data, status);
    logPosSyncLine(
      `[pos-license-sync] reactivate failed tenantId=${tenantId} posOrgId=${link.posOrgId}: ${message}`,
      log,
    );
    return { ok: false, error: message };
  }

  logPosSyncLine(
    `[pos-license-sync] reactivated POS org tenantId=${tenantId} posOrgId=${link.posOrgId}`,
    log,
  );
  return { ok: true };
}

/** Suspend the linked POS organization when Stockix license is revoked or expired. */
export async function suspendPosOrgForLicense(
  db: Db,
  tenantId: string,
  reason: string,
  log?: (message: string) => void,
): Promise<PosSyncResult> {
  const link = await getPosTenantLink(db, tenantId);
  if (!link) return { ok: true };

  const { data, status } = await posProxyJson(
    `/organizations/${encodeURIComponent(link.posOrgId)}/suspend`,
    "POST",
    { reason },
  );

  if (status < 200 || status >= 300) {
    const message = proxyErrorMessage(data, status);
    logPosSyncLine(
      `[pos-license-sync] suspend failed tenantId=${tenantId} posOrgId=${link.posOrgId}: ${message}`,
      log,
    );
    return { ok: false, error: message };
  }

  logPosSyncLine(
    `[pos-license-sync] suspended POS org tenantId=${tenantId} posOrgId=${link.posOrgId} reason=${reason}`,
    log,
  );
  return { ok: true };
}

export function posSyncResultToStatus(
  result: PosSyncResult,
  hasTenant: boolean,
): "ok" | "failed" | "skipped" {
  if (!hasTenant) return "skipped";
  return result.ok ? "ok" : "failed";
}
