import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  FinanceLicenseSyncError,
  syncFinanceLicense,
} from "../../../infra/worker-service/domain/provisioning/adapters/sync-finance-license.js";

describe("syncFinanceLicense payload", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("INTERNAL_API_SECRET", "test-internal-secret");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("requires maxOrganizations and maxActivations", async () => {
    await expect(
      syncFinanceLicense(
        "http://127.0.0.1:4100",
        { tenantId: 2, maxOrganizations: 3 } as never,
        () => {},
      ),
    ).rejects.toBeInstanceOf(FinanceLicenseSyncError);

    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;

    await syncFinanceLicense(
      "http://127.0.0.1:4100",
      { tenantId: 2, maxOrganizations: 3, maxActivations: 2 },
      () => {},
    );

    expect(globalThis.fetch).toHaveBeenCalled();
    const body = JSON.parse(
      String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body),
    );
    expect(body.maxOrganizations).toBe(3);
    expect(body.maxActivations).toBe(2);
  });
});
