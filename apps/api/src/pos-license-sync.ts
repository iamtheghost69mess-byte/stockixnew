import { tenantDeployments, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import { parseLicenseModulesJson } from "./license-utils.js";
import { posProxyJson } from "./pos-proxy.js";

type Db = PostgresJsDatabase<typeof schema>;

type PosTenantLink = {
  posOrgId: string;
  modules: ReturnType<typeof parseLicenseModulesJson>;
};

type LicenseWindowSource = {
  isPerpetual: boolean;
  expiresAt: Date | null;
  validFrom?: Date | null;
  activatedAt?: Date | null;
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

/**
 * Push Stockix license window dates to the linked POS organization.
 * Non-fatal: logs and returns on missing POS link or proxy failure.
 */
export async function syncPosOrgLicenseWindow(
  db: Db,
  tenantId: string,
  window: { startsAt?: Date; endsAt?: Date },
  log?: (message: string) => void,
): Promise<void> {
  const link = await getPosTenantLink(db, tenantId);
  if (!link) return;

  const payload: Record<string, string> = {};
  if (window.startsAt) payload.licenseStartsAt = window.startsAt.toISOString();
  if (window.endsAt) payload.licenseEndsAt = window.endsAt.toISOString();
  if (Object.keys(payload).length === 0) return;

  const { data, status } = await posProxyJson(
    `/organizations/${encodeURIComponent(link.posOrgId)}/license`,
    "PATCH",
    payload,
  );

  if (status < 200 || status >= 300) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message)
        : `HTTP ${status}`;
    const line = `[pos-license-sync] license window sync failed tenantId=${tenantId} posOrgId=${link.posOrgId}: ${message}`;
    if (log) log(line);
    else console.error(line);
    return;
  }

  const okLine = `[pos-license-sync] synced POS license window tenantId=${tenantId} posOrgId=${link.posOrgId}`;
  if (log) log(okLine);
  else console.log(okLine);
}

/** Sync POS org window from a Stockix license row. */
export async function syncPosOrgLicenseFromLicense(
  db: Db,
  tenantId: string,
  license: LicenseWindowSource,
  log?: (message: string) => void,
): Promise<void> {
  const { startsAt, endsAt } = resolveLicenseWindowDates(license);
  await syncPosOrgLicenseWindow(db, tenantId, { startsAt, endsAt }, log);
}

/**
 * Reactivate a suspended POS org after license extend/reactivate.
 * Non-fatal: logs and returns on missing POS link or proxy failure.
 */
export async function reactivatePosOrgForLicense(
  db: Db,
  tenantId: string,
  log?: (message: string) => void,
): Promise<void> {
  const link = await getPosTenantLink(db, tenantId);
  if (!link) return;

  const { data, status } = await posProxyJson(
    `/organizations/${encodeURIComponent(link.posOrgId)}/lifecycle`,
    "PATCH",
    { lifecycle: "active", lifecycleReasonCode: "license_reactivated" },
  );

  if (status < 200 || status >= 300) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message)
        : `HTTP ${status}`;
    const line = `[pos-license-sync] reactivate failed tenantId=${tenantId} posOrgId=${link.posOrgId}: ${message}`;
    if (log) log(line);
    else console.error(line);
    return;
  }

  const okLine = `[pos-license-sync] reactivated POS org tenantId=${tenantId} posOrgId=${link.posOrgId}`;
  if (log) log(okLine);
  else console.log(okLine);
}

/**
 * Suspend the linked POS organization when Stockix license is revoked or expired.
 * Non-fatal: logs and returns on missing POS link or proxy failure.
 */
export async function suspendPosOrgForLicense(
  db: Db,
  tenantId: string,
  reason: string,
  log?: (message: string) => void,
): Promise<void> {
  const link = await getPosTenantLink(db, tenantId);
  if (!link) return;

  const { data, status } = await posProxyJson(
    `/organizations/${encodeURIComponent(link.posOrgId)}/suspend`,
    "POST",
    { reason },
  );

  if (status < 200 || status >= 300) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message)
        : `HTTP ${status}`;
    const line = `[pos-license-sync] suspend failed tenantId=${tenantId} posOrgId=${link.posOrgId}: ${message}`;
    if (log) log(line);
    else console.error(line);
    return;
  }

  const okLine = `[pos-license-sync] suspended POS org tenantId=${tenantId} posOrgId=${link.posOrgId} reason=${reason}`;
  if (log) log(okLine);
  else console.log(okLine);
}
