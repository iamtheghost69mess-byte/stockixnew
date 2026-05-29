import type { LicenseStatus } from './License.types';

const LICENSE_CACHE_TTL_MS = 60_000;

type LicenseCacheEntry = {
  effectiveStatus: LicenseStatus | null;
  cachedAt: number;
};

/** In-memory license status cache per tenant (hot path — avoids DB hit every request). */
export const licenseCache = new Map<number, LicenseCacheEntry>();

export function clearLicenseCache(tenantId?: number): void {
  if (tenantId === undefined) {
    licenseCache.clear();
    return;
  }
  licenseCache.delete(tenantId);
}

export function getLicenseCacheTtlMs(): number {
  return LICENSE_CACHE_TTL_MS;
}

export type { LicenseCacheEntry };
