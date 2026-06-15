import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerTenantModulesRoutes } from "../src/tenant-modules-http.js";

const insertTenantJob = vi.fn();
const logAudit = vi.fn();
const syncFinanceLicense = vi.fn();

vi.mock("../src/services/tenant-jobs.js", () => ({
  insertTenantJob: (...args: unknown[]) => insertTenantJob(...args),
}));

vi.mock("../src/audit.js", () => ({
  logAudit: (...args: unknown[]) => logAudit(...args),
}));

vi.mock("../src/provision-trace.js", () => ({
  createProvisionTracer: () => ({
    event: vi.fn(async () => undefined),
  }),
}));

vi.mock("../src/license-utils.js", () => ({
  getActiveLicenseForTenant: vi.fn(async () => ({ id: "lic-1" })),
}));

vi.mock("../src/finance-license.client.js", () => ({
  syncFinanceLicenseForStockixTenant: (...args: unknown[]) => syncFinanceLicense(...args),
}));

describe("tenant module routes", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";

  let tenantModules = '["accounting"]';
  let tenantUpdateCalls: Record<string, unknown>[] = [];
  let licenseUpdateCalls: Record<string, unknown>[] = [];

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            {
              id: tenantId,
              slug: "demo",
              name: "Demo",
              adminEmail: "admin@demo.com",
              planSlug: "starter",
              modules: tenantModules,
              status: "active",
              financeTenantId: 42,
            },
          ]),
        })),
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                id: tenantId,
                slug: "demo",
                modules: tenantModules,
                financeTenantId: 42,
              },
            ]),
          })),
        })),
      })),
    })),
    update: vi.fn((table: { _: { name?: string } }) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          const tableName = table?._?.name ?? "";
          if (tableName.includes("tenants")) tenantUpdateCalls.push(values);
          if (tableName.includes("licenses")) licenseUpdateCalls.push(values);
          return undefined;
        }),
      })),
    })),
  };

  beforeEach(() => {
    tenantModules = '["accounting"]';
    tenantUpdateCalls = [];
    licenseUpdateCalls = [];
    insertTenantJob.mockReset();
    logAudit.mockReset();
    syncFinanceLicense.mockReset();
    syncFinanceLicense.mockResolvedValue(undefined);
    insertTenantJob.mockResolvedValue({ id: "job-1" });
    db.select.mockClear();
    db.update.mockClear();
  });

  function buildApp(actorRole = "super_admin") {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("actorId", "owner-1");
      c.set("actorRole", actorRole);
      await next();
    });
    registerTenantModulesRoutes(app as never, db as never);
    return app;
  }

  it("add-module enqueues add_module job", async () => {
    const app = buildApp();
    const res = await app.request(`http://local/tenants/${tenantId}/add-module`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "pos" }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { accepted?: boolean; module?: string };
    expect(body.accepted).toBe(true);
    expect(body.module).toBe("pos");
    expect(insertTenantJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "add_module",
        tenantId,
        payload: expect.objectContaining({ module: "pos", slug: "demo" }),
      }),
    );
  });

  it("add-module rejects duplicate module", async () => {
    tenantModules = '["accounting","pos"]';
    const app = buildApp();
    const res = await app.request(`http://local/tenants/${tenantId}/add-module`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "pos" }),
    });
    expect(res.status).toBe(400);
    expect(insertTenantJob).not.toHaveBeenCalled();
  });

  it("add-module requires super_admin", async () => {
    const app = buildApp("support_agent");
    const res = await app.request(`http://local/tenants/${tenantId}/add-module`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "chat" }),
    });
    expect(res.status).toBe(403);
  });

  it("remove-module updates license and enqueues stop job", async () => {
    tenantModules = '["accounting","pos"]';
    const app = buildApp();
    const res = await app.request(`http://local/tenants/${tenantId}/remove-module`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "pos" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; warning?: string };
    expect(body.ok).toBe(true);
    expect(body.warning).toMatch(/data volumes were not destroyed/i);
    expect(insertTenantJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "remove_module",
        payload: expect.objectContaining({ module: "pos", slug: "demo" }),
      }),
    );
    expect(syncFinanceLicense).toHaveBeenCalled();
  });
});
