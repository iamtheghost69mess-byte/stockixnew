import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiConfigMock = vi.hoisted(() => ({
  internalApiSecret: undefined as string | undefined,
  nodeEnv: "test",
}));

vi.mock("@repo/config", () => ({
  apiConfig: {
    get internalApiSecret() {
      return apiConfigMock.internalApiSecret;
    },
    get nodeEnv() {
      return apiConfigMock.nodeEnv;
    },
  },
}));

import {
  FinanceLicenseSyncError,
  syncFinanceLicense,
} from "../../../infra/worker-service/domain/provisioning/adapters/sync-finance-license.js";

describe("syncFinanceLicense adapter", () => {
  const originalFetch = globalThis.fetch;
  const logs: string[] = [];
  const log = (message: string) => logs.push(message);

  beforeEach(() => {
    logs.length = 0;
    apiConfigMock.internalApiSecret = undefined;
    apiConfigMock.nodeEnv = "test";
    delete process.env.FINANCE_LICENSE_SYNC_OPTIONAL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.FINANCE_LICENSE_SYNC_OPTIONAL;
  });

  it("throws when INTERNAL_API_SECRET is missing", async () => {
    await expect(
      syncFinanceLicense("http://127.0.0.1:4100", { tenantId: 42 }, log),
    ).rejects.toMatchObject({
      code: "FINANCE_LICENSE_SYNC_FAILED",
      message: expect.stringContaining("INTERNAL_API_SECRET"),
    });
  });

  it("skips when secret missing and FINANCE_LICENSE_SYNC_OPTIONAL in development", async () => {
    process.env.FINANCE_LICENSE_SYNC_OPTIONAL = "1";
    apiConfigMock.nodeEnv = "development";
    await syncFinanceLicense("http://127.0.0.1:4100", { tenantId: 42 }, log);
    expect(logs.some((l) => l.includes("skipping"))).toBe(true);
  });

  it("throws on non-2xx response", async () => {
    apiConfigMock.internalApiSecret = "test-secret";
    globalThis.fetch = vi.fn(async () => new Response("bad", { status: 500 })) as typeof fetch;

    await expect(
      syncFinanceLicense("http://127.0.0.1:4100", { tenantId: 99 }, log),
    ).rejects.toBeInstanceOf(FinanceLicenseSyncError);
  });

  it("succeeds on 2xx response", async () => {
    apiConfigMock.internalApiSecret = "test-secret";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ) as typeof fetch;

    await syncFinanceLicense("http://127.0.0.1:4100", { tenantId: 7 }, log);
    expect(logs.some((l) => l.includes("finance license synced"))).toBe(true);
  });
});
