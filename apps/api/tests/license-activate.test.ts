import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

vi.mock("@repo/config", () => ({
  apiConfig: {
    licenseSigningSecret: "test-license-signing-secret-32chars",
  },
  licenseConfig: {
    defaultTermDays: 365,
    syncStrict: false,
  },
}));

vi.mock("../src/audit.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/license-finance-sync.js", () => ({
  triggerFinanceLicenseSync: vi.fn(),
}));

const signOfflineTokenMock = vi.fn();

vi.mock("../src/license-utils.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/license-utils.js")>();
  return {
    ...mod,
    signOfflineToken: signOfflineTokenMock,
    insertLicenseHistory: vi.fn().mockResolvedValue(undefined),
  };
});

type LicenseRow = {
  id: string;
  licenseKey: string;
  product: string;
  planSlug: string;
  tenantId: string | null;
  status: string;
  activatedAt: Date | null;
  validFrom: Date | null;
  expiresAt: Date | null;
  isPerpetual: boolean;
  maxActivations: number;
  activationCount: number;
  gracePeriodDays: number;
  notes: string | null;
  createdById: string | null;
  revokedAt: Date | null;
  revokedById: string | null;
  revokeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeLicense(overrides: Partial<LicenseRow>): LicenseRow {
  const now = new Date();
  return {
    id: "lic-11111111-1111-1111-1111-111111111111",
    licenseKey: "STKX-AAAA-BBBB-CCCC",
    product: "pos_desktop",
    planSlug: "starter",
    tenantId: "tenant-11111111-1111-1111-1111-111111111111",
    status: "active",
    activatedAt: now,
    validFrom: null,
    expiresAt: null,
    isPerpetual: true,
    maxActivations: 5,
    activationCount: 0,
    gracePeriodDays: 7,
    notes: null,
    createdById: null,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createSelectLimitMock(
  results: unknown[][],
): ReturnType<typeof vi.fn> {
  let call = 0;
  return vi.fn(async () => {
    const row = results[call] ?? [];
    call += 1;
    return row;
  });
}

function createMockDb(license: LicenseRow | null) {
  const limit = createSelectLimitMock([[], license ? [license] : [], []]);

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit })),
    })),
  }));

  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([{ id: "act-11111111-1111-1111-1111-111111111111" }]),
    })),
  }));

  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  }));

  return { select, insert, update } as unknown as PostgresJsDatabase<typeof schema>;
}

describe("POST /licenses/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOfflineTokenMock.mockResolvedValue({
      token: "offline-token",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  });

  it("returns 403 when license status is unassigned", async () => {
    vi.resetModules();
    const { registerLicenseApi } = await import("../src/license-http.js");
    const testApp = new Hono();
    registerLicenseApi(
      testApp,
      createMockDb(
        makeLicense({ status: "unassigned", tenantId: null, activatedAt: null }),
      ),
    );

    const res = await testApp.request("http://local/licenses/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        licenseKey: "STKX-AAAA-BBBB-CCCC",
        hardwareFingerprint: "device-fingerprint-abc12345",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toMatchObject({ error: "license_not_active" });
    expect(signOfflineTokenMock).not.toHaveBeenCalled();
  });

  it("returns 403 when license status is revoked", async () => {
    const { registerLicenseApi } = await import("../src/license-http.js");
    const testApp = new Hono();
    registerLicenseApi(
      testApp,
      createMockDb(makeLicense({ status: "revoked" })),
    );

    const res = await testApp.request("http://local/licenses/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        licenseKey: "STKX-AAAA-BBBB-CCCC",
        hardwareFingerprint: "device-fingerprint-abc12345",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toMatchObject({ error: "license_revoked" });
    expect(signOfflineTokenMock).not.toHaveBeenCalled();
  });

  it("returns 403 when license status is expired", async () => {
    const { registerLicenseApi } = await import("../src/license-http.js");
    const testApp = new Hono();
    registerLicenseApi(
      testApp,
      createMockDb(
        makeLicense({
          status: "expired",
          isPerpetual: false,
          expiresAt: new Date(Date.now() - 86_400_000),
        }),
      ),
    );

    const res = await testApp.request("http://local/licenses/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        licenseKey: "STKX-AAAA-BBBB-CCCC",
        hardwareFingerprint: "device-fingerprint-abc12345",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toMatchObject({ error: "license_expired" });
    expect(signOfflineTokenMock).not.toHaveBeenCalled();
  });

  it("returns 403 when license is active but has no tenantId", async () => {
    const { registerLicenseApi } = await import("../src/license-http.js");
    const testApp = new Hono();
    registerLicenseApi(
      testApp,
      createMockDb(makeLicense({ status: "active", tenantId: null })),
    );

    const res = await testApp.request("http://local/licenses/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        licenseKey: "STKX-AAAA-BBBB-CCCC",
        hardwareFingerprint: "device-fingerprint-abc12345",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toMatchObject({ error: "license_not_assigned" });
    expect(signOfflineTokenMock).not.toHaveBeenCalled();
  });

  it("allows activation when license is active and assigned", async () => {
    const { registerLicenseApi } = await import("../src/license-http.js");
    const testApp = new Hono();
    registerLicenseApi(testApp, createMockDb(makeLicense({ status: "active" })));

    const res = await testApp.request("http://local/licenses/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        licenseKey: "STKX-AAAA-BBBB-CCCC",
        hardwareFingerprint: "device-fingerprint-abc12345",
        machineName: "POS-1",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      offlineToken: "offline-token",
      license: { licenseKey: "STKX-AAAA-BBBB-CCCC" },
    });
    expect(signOfflineTokenMock).toHaveBeenCalled();
  });
});
