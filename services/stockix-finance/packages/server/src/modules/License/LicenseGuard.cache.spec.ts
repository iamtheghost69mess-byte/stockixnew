import { clearLicenseCache, licenseCache } from './LicenseGuard.cache';

describe('LicenseGuard.cache', () => {
  beforeEach(() => {
    licenseCache.clear();
  });

  it('clearLicenseCache removes a single tenant entry', () => {
    licenseCache.set(1, { effectiveStatus: 'active', cachedAt: Date.now() });
    licenseCache.set(2, { effectiveStatus: 'grace', cachedAt: Date.now() });

    clearLicenseCache(1);

    expect(licenseCache.has(1)).toBe(false);
    expect(licenseCache.has(2)).toBe(true);
  });

  it('clearLicenseCache without tenantId clears all entries', () => {
    licenseCache.set(1, { effectiveStatus: 'active', cachedAt: Date.now() });
    clearLicenseCache();
    expect(licenseCache.size).toBe(0);
  });
});
