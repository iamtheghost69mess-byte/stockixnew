import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

const posProxyJson = vi.fn();

vi.mock("../src/pos-proxy.js", () => ({
  posProxyJson: (...args: unknown[]) => posProxyJson(...args),
}));

describe("suspendPosOrgForLicense", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const posOrgId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    posProxyJson.mockReset();
  });

  function buildDb(modules: string, posOrganizationId: string | null) {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [
                {
                  modules: JSON.stringify(modules),
                  posOrganizationId,
                },
              ]),
            })),
          })),
        })),
      })),
    } as unknown as PostgresJsDatabase<typeof schema>;
  }

  it("calls POS suspend when tenant has pos module and org id", async () => {
    posProxyJson.mockResolvedValueOnce({ status: 200, data: { success: true } });
    const { suspendPosOrgForLicense } = await import("../src/pos-license-sync.js");
    await suspendPosOrgForLicense(buildDb(["accounting", "pos"], posOrgId), tenantId, "license_revoked");
    expect(posProxyJson).toHaveBeenCalledWith(
      `/organizations/${encodeURIComponent(posOrgId)}/suspend`,
      "POST",
      { reason: "license_revoked" },
    );
  });

  it("skips when pos module is not licensed", async () => {
    const { suspendPosOrgForLicense } = await import("../src/pos-license-sync.js");
    await suspendPosOrgForLicense(buildDb(["accounting"], posOrgId), tenantId, "license_expired");
    expect(posProxyJson).not.toHaveBeenCalled();
  });

  it("skips when pos organization is not linked", async () => {
    const { suspendPosOrgForLicense } = await import("../src/pos-license-sync.js");
    await suspendPosOrgForLicense(buildDb(["pos"], null), tenantId, "license_expired");
    expect(posProxyJson).not.toHaveBeenCalled();
  });
});
