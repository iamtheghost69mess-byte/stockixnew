import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

vi.mock("../src/audit.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/license-finance-sync.js", () => ({
  triggerFinanceLicenseSync: vi.fn(),
}));

vi.mock("../src/pos-license-sync.js", () => ({
  suspendPosOrgForLicense: vi.fn(),
  syncPosOrgLicenseWindow: vi.fn(),
  syncPosOrgLicenseFromLicense: vi.fn(),
  reactivatePosOrgForLicense: vi.fn(),
}));

const tenantHasActiveLicenseMock = vi.fn();

vi.mock("../src/license-utils.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/license-utils.js")>();
  return {
    ...mod,
    tenantHasActiveLicense: (...args: unknown[]) => tenantHasActiveLicenseMock(...args),
    getPlanLimits: vi.fn().mockResolvedValue({
      maxOrganizations: 1,
      maxActivations: 1,
      maxUsers: 999,
    }),
    generateLicenseKey: vi.fn().mockReturnValue("STKX-TEST-TEST-TEST"),
    insertLicenseHistory: vi.fn().mockResolvedValue(undefined),
  };
});

const tenantId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const licenseId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function createAssignMockDb() {
  const unassignedLicense = {
    id: licenseId,
    licenseKey: "STKX-UNAS-IGNED-KEY1",
    product: "platform",
    planSlug: "starter",
    tenantId: null,
    status: "unassigned",
    activatedAt: null,
    validFrom: null,
    expiresAt: null,
    isPerpetual: true,
    maxOrganizations: 1,
    maxActivations: 1,
    activationCount: 0,
    gracePeriodDays: 7,
    modules: '["accounting"]',
    notes: null,
    createdById: null,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let selectCall = 0;
  const selectLimit = vi.fn(async () => {
    selectCall += 1;
    if (selectCall === 1) return [unassignedLicense];
    if (selectCall === 2) return [{ id: tenantId }];
    if (selectCall === 3) return [];
    return [];
  });

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: selectLimit })),
    })),
  }));

  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          {
            ...unassignedLicense,
            tenantId,
            status: "active",
            activatedAt: new Date(),
            validFrom: new Date(),
          },
        ]),
      })),
    })),
  }));

  return { db: { select, update } as unknown as PostgresJsDatabase<typeof schema> };
}

describe("single active license enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /licenses/:id/assign returns 409 when tenant already licensed", async () => {
    tenantHasActiveLicenseMock.mockResolvedValue(true);
    const { db } = createAssignMockDb();
    const app = new Hono<{ Variables: { actorId: string; actorRole: string } }>();
    app.use("*", async (c, next) => {
      c.set("actorId", "owner-11111111-1111-1111-1111-111111111111");
      c.set("actorRole", "super_admin");
      await next();
    });
    const { registerLicenseApi } = await import("../src/license-http.js");
    registerLicenseApi(app, db);

    const res = await app.request(`http://local/licenses/${licenseId}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({ error: "tenant_already_licensed" });
  });

  it("POST /licenses/generate returns 409 when tenantId already licensed", async () => {
    tenantHasActiveLicenseMock.mockResolvedValue(true);
    const selectLimit = vi
      .fn()
      .mockResolvedValueOnce([{ id: "plan-id" }])
      .mockResolvedValueOnce([{ id: tenantId }]);

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: selectLimit })),
        })),
      })),
      transaction: vi.fn(),
    } as unknown as PostgresJsDatabase<typeof schema>;

    const app = new Hono<{ Variables: { actorId: string; actorRole: string } }>();
    app.use("*", async (c, next) => {
      c.set("actorId", "owner-11111111-1111-1111-1111-111111111111");
      c.set("actorRole", "super_admin");
      await next();
    });
    const { registerLicenseApi } = await import("../src/license-http.js");
    registerLicenseApi(app, db);

    const res = await app.request("http://local/licenses/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        product: "platform",
        planSlug: "starter",
        tenantId,
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({ error: "tenant_already_licensed" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
