import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

const syncPosOrgLicenseFromLicenseMock = vi.fn();
const reactivatePosOrgForLicenseMock = vi.fn();
const triggerFinanceLicenseSyncMock = vi.fn();

vi.mock("../src/audit.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/license-finance-sync.js", () => ({
  triggerFinanceLicenseSync: (...args: unknown[]) =>
    triggerFinanceLicenseSyncMock(...args),
}));

vi.mock("../src/pos-license-sync.js", () => ({
  suspendPosOrgForLicense: vi.fn(),
  syncPosOrgLicenseWindow: vi.fn(),
  syncPosOrgLicenseFromLicense: (...args: unknown[]) =>
    syncPosOrgLicenseFromLicenseMock(...args),
  reactivatePosOrgForLicense: (...args: unknown[]) =>
    reactivatePosOrgForLicenseMock(...args),
}));

vi.mock("../src/license-utils.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/license-utils.js")>();
  return {
    ...mod,
    insertLicenseHistory: vi.fn().mockResolvedValue(undefined),
  };
});

const licenseId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const tenantId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function createExtendMockDb() {
  const licenseRow = {
    id: licenseId,
    licenseKey: "STKX-AAAA-BBBB-CCCC",
    product: "platform",
    planSlug: "starter",
    tenantId,
    status: "active",
    activatedAt: new Date("2026-01-01T00:00:00.000Z"),
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2026-06-01T00:00:00.000Z"),
    isPerpetual: false,
    maxActivations: 1,
    maxOrganizations: 1,
    activationCount: 0,
    gracePeriodDays: 7,
    notes: null,
    createdById: null,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    modules: '["accounting","pos"]',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const updatedRow = {
    ...licenseRow,
    expiresAt: new Date("2027-06-01T00:00:00.000Z"),
    updatedAt: new Date(),
  };

  const selectLimit = vi
    .fn()
    .mockResolvedValueOnce([licenseRow])
    .mockResolvedValueOnce([]);

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: selectLimit })),
    })),
  }));

  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([updatedRow]),
      })),
    })),
  }));

  return { db: { select, update } as unknown as PostgresJsDatabase<typeof schema>, updatedRow };
}

describe("POST /licenses/:licenseId/extend POS sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncPosOrgLicenseFromLicenseMock.mockResolvedValue(undefined);
    reactivatePosOrgForLicenseMock.mockResolvedValue(undefined);
    triggerFinanceLicenseSyncMock.mockResolvedValue(undefined);
  });

  it("syncs POS license window and reactivates org after extend", async () => {
    const { db, updatedRow } = createExtendMockDb();
  const app = new Hono<{ Variables: { actorId: string; actorRole: string } }>();
    app.use("*", async (c, next) => {
      c.set("actorId", "owner-11111111-1111-1111-1111-111111111111");
      c.set("actorRole", "super_admin");
      await next();
    });
    const { registerLicenseApi } = await import("../src/license-http.js");
    registerLicenseApi(app, db);

    const res = await app.request(`http://local/licenses/${licenseId}/extend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expiresAt: "2027-06-01T00:00:00.000Z" }),
    });

    expect(res.status).toBe(200);
    expect(syncPosOrgLicenseFromLicenseMock).toHaveBeenCalledWith(
      db,
      tenantId,
      expect.objectContaining({ id: licenseId, expiresAt: updatedRow.expiresAt }),
    );
    expect(reactivatePosOrgForLicenseMock).toHaveBeenCalledWith(db, tenantId);
    expect(triggerFinanceLicenseSyncMock).toHaveBeenCalledWith(db, tenantId);
  });
});
