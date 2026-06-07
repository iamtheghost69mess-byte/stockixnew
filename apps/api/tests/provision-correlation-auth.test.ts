import { describe, expect, it, vi } from "vitest";
import { assertCorrelationJobAccess } from "../src/routes/provision-correlation-auth.js";

describe("assertCorrelationJobAccess", () => {
  const correlationId = "corr-11111111-1111-1111-1111-111111111111";
  const ownerA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const ownerB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const tenantId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

  function mockDb(job: Record<string, unknown> | null) {
    const limit = vi.fn().mockResolvedValue(job ? [job] : []);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ leftJoin });
    const select = vi.fn().mockReturnValue({ from });
    return {
      select,
      assertTenantInOwnerScope: vi.fn(),
    } as unknown as Parameters<typeof assertCorrelationJobAccess>[0];
  }

  it("returns 404 when job is missing", async () => {
    const db = mockDb(null);
    const result = await assertCorrelationJobAccess(db, correlationId, ownerA, "read_only", []);
    expect(result).toEqual({ ok: false, status: 404, error: "provision_job_not_found" });
  });

  it("allows super_admin for any correlation", async () => {
    const db = mockDb({
      id: "job-1",
      type: "tenant.provision",
      status: "running",
      tenantId,
      correlationId,
      payload: { ownerId: ownerB },
      tenantOwnerId: ownerB,
    });
    const result = await assertCorrelationJobAccess(db, correlationId, ownerA, "super_admin", ["*"]);
    expect(result.ok).toBe(true);
  });

  it("allows job payload owner before tenant row exists", async () => {
    const db = mockDb({
      id: "job-1",
      type: "tenant.provision",
      status: "pending",
      tenantId: null,
      correlationId,
      payload: { ownerId: ownerA },
      tenantOwnerId: null,
    });
    const result = await assertCorrelationJobAccess(db, correlationId, ownerA, "read_only", []);
    expect(result.ok).toBe(true);
  });

  it("allows tenant owner", async () => {
    const db = mockDb({
      id: "job-1",
      type: "tenant.provision",
      status: "running",
      tenantId,
      correlationId,
      payload: {},
      tenantOwnerId: ownerA,
    });
    const result = await assertCorrelationJobAccess(db, correlationId, ownerA, "read_only", []);
    expect(result.ok).toBe(true);
  });

  it("returns 403 for foreign owner", async () => {
    const db = mockDb({
      id: "job-1",
      type: "tenant.provision",
      status: "running",
      tenantId,
      correlationId,
      payload: { ownerId: ownerB },
      tenantOwnerId: ownerB,
    });
    const result = await assertCorrelationJobAccess(db, correlationId, ownerA, "read_only", []);
    expect(result).toEqual({ ok: false, status: 403, error: "forbidden" });
  });
});
