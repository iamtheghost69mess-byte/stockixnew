import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBuildOrganization } from "./fetch-stockix-finance-build-org.js";
import { MENA_DEFAULTS } from "./fetch-stockix-finance-org-settings.js";

describe("fetchBuildOrganization signin errors", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("never returns bare signin_failed", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("No organization found for this user", { status: 401 }),
    );
    const result = await fetchBuildOrganization(
      {
        internalBaseUrl: "http://127.0.0.1:4100",
        adminEmail: "admin@test.com",
        adminPassword: "secret",
        settings: { ...MENA_DEFAULTS, name: "Test Co" },
        correlationId: "corr-build-1",
      },
      () => undefined,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).not.toBe("signin_failed");
    expect(result.error).toContain("signin_no_organization");
  });
});
