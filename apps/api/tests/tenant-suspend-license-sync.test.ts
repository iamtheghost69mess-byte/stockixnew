import { beforeEach, describe, expect, it, vi } from "vitest";

const triggerFinanceMock = vi.fn().mockResolvedValue(undefined);
const suspendPosMock = vi.fn().mockResolvedValue({ ok: true });
const reactivatePosMock = vi.fn().mockResolvedValue({ ok: true });
const syncPosFromLicenseMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock("../src/license-finance-sync.js", () => ({
  triggerFinanceLicenseSync: (...args: unknown[]) => triggerFinanceMock(...args),
}));

vi.mock("../src/pos-license-sync.js", () => ({
  suspendPosOrgForLicense: (...args: unknown[]) => suspendPosMock(...args),
  reactivatePosOrgForLicense: (...args: unknown[]) => reactivatePosMock(...args),
  syncPosOrgLicenseFromLicense: (...args: unknown[]) => syncPosFromLicenseMock(...args),
}));

vi.mock("../src/license-utils.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/license-utils.js")>();
  return {
    ...mod,
    insertLicenseHistory: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  applyTenantLicenseReactivate,
  applyTenantLicenseSuspend,
} from "../src/tenant-license-lifecycle.js";

const tenantId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const licenseId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("tenant license lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applyTenantLicenseSuspend updates tenant, license, and syncs products", async () => {
    const licenseRow = {
      id: licenseId,
      status: "active",
      tenantId,
      activatedAt: new Date(),
    };

    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => [licenseRow]),
            })),
          })),
        })),
      })),
    } as never;

    await applyTenantLicenseSuspend(db, tenantId, "tenant_suspended", () => {});

    expect(triggerFinanceMock).toHaveBeenCalledWith(db, tenantId, expect.any(Function));
    expect(suspendPosMock).toHaveBeenCalledWith(
      db,
      tenantId,
      "tenant_suspended",
      expect.any(Function),
    );
  });

  it("applyTenantLicenseReactivate reactivates suspended license", async () => {
    const licenseRow = {
      id: licenseId,
      status: "suspended",
      tenantId,
      isPerpetual: true,
      activatedAt: new Date(),
      validFrom: new Date(),
      expiresAt: null,
      updatedAt: new Date(),
    };

    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => [licenseRow]),
            })),
          })),
        })),
      })),
    } as never;

    await applyTenantLicenseReactivate(db, tenantId, () => {});

    expect(reactivatePosMock).toHaveBeenCalled();
    expect(triggerFinanceMock).toHaveBeenCalledWith(db, tenantId, expect.any(Function));
  });
});
