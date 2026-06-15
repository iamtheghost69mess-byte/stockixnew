import { describe, expect, it } from "vitest";

/** Mirrors GET /tenants/provision-status completed payload tenantId resolution. */
function resolveProvisionStatusTenantId(
  lastJob: { tenantId?: string | null },
  eventMeta: Record<string, unknown>,
): string | null {
  return (
    (typeof lastJob.tenantId === "string" ? lastJob.tenantId : null)
    ?? (typeof eventMeta.tenantId === "string" ? eventMeta.tenantId : null)
  );
}

describe("resolveProvisionStatusTenantId", () => {
  it("prefers lastJob.tenantId when complete event meta lacks tenantId", () => {
    const jobTenant = "9e3635de-8514-4a20-a44c-d60f7ef4d404";
    expect(
      resolveProvisionStatusTenantId({ tenantId: jobTenant }, {}),
    ).toBe(jobTenant);
  });

  it("falls back to event meta tenantId", () => {
    const fromEvent = "00000000-0000-4000-8000-000000000001";
    expect(
      resolveProvisionStatusTenantId({ tenantId: null }, { tenantId: fromEvent }),
    ).toBe(fromEvent);
  });

  it("returns null when neither source has tenantId", () => {
    expect(resolveProvisionStatusTenantId({}, {})).toBeNull();
  });
});
