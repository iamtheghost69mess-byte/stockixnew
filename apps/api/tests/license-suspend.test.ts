import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

vi.mock("../src/audit.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/license-finance-sync.js", () => ({
  triggerFinanceLicenseSync: vi.fn().mockResolvedValue(undefined),
}));

const suspendPosMock = vi.fn().mockResolvedValue({ ok: true });
const reactivatePosMock = vi.fn().mockResolvedValue({ ok: true });
const syncPosFromLicenseMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock("../src/pos-license-sync.js", () => ({
  suspendPosOrgForLicense: (...args: unknown[]) => suspendPosMock(...args),
  reactivatePosOrgForLicense: (...args: unknown[]) => reactivatePosMock(...args),
  syncPosOrgLicenseFromLicense: (...args: unknown[]) => syncPosFromLicenseMock(...args),
  syncPosOrgLicenseWindow: vi.fn(),
  posSyncResultToStatus: (result: { ok: boolean }, hasTenant: boolean) => {
    if (!hasTenant) return "skipped";
    return result.ok ? "ok" : "failed";
  },
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

function activeLicense(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: licenseId,
    licenseKey: "STKX-TEST-TEST-TEST",
    product: "platform",
    planSlug: "starter",
    tenantId,
    status: "active",
    activatedAt: new Date(),
    validFrom: new Date(),
    expiresAt: null,
    isPerpetual: true,
    maxOrganizations: 1,
    maxActivations: 1,
    maxUsers: 999,
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
    ...overrides,
  };
}

function createSuspendDb(initialStatus: string) {
  let currentStatus = initialStatus;
  const lic = activeLicense({ status: initialStatus });

  const selectLimit = vi.fn(async () => [activeLicense({ status: currentStatus })]);

  const updateWhere = vi.fn(() => Promise.resolve(undefined));
  const updateReturning = vi.fn(async () => {
    currentStatus = "active";
    return [activeLicense({ status: "active" })];
  });
  const updateWhereReturning = vi.fn(() => ({ returning: updateReturning }));

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: selectLimit })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((vals: { status?: string }) => ({
        where: vi.fn(() => {
          if (vals.status === "suspended") return updateWhere();
          return updateWhereReturning();
        }),
      })),
    })),
  };

  return { db: db as unknown as PostgresJsDatabase<typeof schema>, lic };
}

describe("license suspend/reactivate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "POST /licenses/:id/suspend sets status suspended and suspends POS",
    async () => {
    const { db } = createSuspendDb("active");
    const { registerLicenseApi } = await import("../src/license-http.js");
    const app = new Hono();
    registerLicenseApi(app, db);

    const res = await app.request(`http://local/licenses/${licenseId}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "billing_hold" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { suspended?: boolean; posSync?: string };
    expect(body.suspended).toBe(true);
    expect(body.posSync).toBe("ok");
    expect(suspendPosMock).toHaveBeenCalledWith(db, tenantId, "billing_hold");
    },
    15_000,
  );

  it("POST /licenses/:id/suspend reports posSync failed when POS proxy fails", async () => {
    suspendPosMock.mockResolvedValueOnce({ ok: false, error: "HTTP 502" });
    const { db } = createSuspendDb("active");
    const { registerLicenseApi } = await import("../src/license-http.js");
    const app = new Hono();
    registerLicenseApi(app, db);

    const res = await app.request(`http://local/licenses/${licenseId}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      posSync?: string;
      errors?: string[];
    };
    expect(body.posSync).toBe("failed");
    expect(body.errors?.some((e) => e.startsWith("pos:"))).toBe(true);
  });

  it("POST /licenses/:id/suspend returns 502 when LICENSE_SYNC_STRICT and POS fails", async () => {
    const prev = process.env.LICENSE_SYNC_STRICT;
    process.env.LICENSE_SYNC_STRICT = "1";
    suspendPosMock.mockResolvedValueOnce({ ok: false, error: "HTTP 502" });
    try {
      vi.resetModules();
      const { db } = createSuspendDb("active");
      const { registerLicenseApi } = await import("../src/license-http.js");
      const app = new Hono();
      registerLicenseApi(app, db);

      const res = await app.request(`http://local/licenses/${licenseId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(502);
      const body = (await res.json()) as { error?: string; posSync?: string };
      expect(body.error).toBe("license_sync_failed");
      expect(body.posSync).toBe("failed");
    } finally {
      if (prev === undefined) delete process.env.LICENSE_SYNC_STRICT;
      else process.env.LICENSE_SYNC_STRICT = prev;
    }
  });

  it("POST /licenses/:id/reactivate sets status active and reactivates POS", async () => {
    const { db } = createSuspendDb("suspended");
    const { registerLicenseApi } = await import("../src/license-http.js");
    const app = new Hono();
    registerLicenseApi(app, db);

    const res = await app.request(`http://local/licenses/${licenseId}/reactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reactivated?: boolean };
    expect(body.reactivated).toBe(true);
    expect(syncPosFromLicenseMock).toHaveBeenCalled();
    expect(reactivatePosMock).toHaveBeenCalledWith(db, tenantId);
  });

  it("POST /licenses/:id/suspend returns 409 when already suspended", async () => {
    const { db } = createSuspendDb("suspended");
    const { registerLicenseApi } = await import("../src/license-http.js");
    const app = new Hono();
    registerLicenseApi(app, db);

    const res = await app.request(`http://local/licenses/${licenseId}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(409);
  });
});
