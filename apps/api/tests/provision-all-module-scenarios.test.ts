/**
 * Comprehensive provisioning scenario tests for all 4 Stockix modules:
 *   accounting (Finance)  |  pos (POS)  |  pms (PMS)  |  chat (Chatwoot)
 *
 * Covers: stack planning, module resolution, data serialization, license access,
 * HTTP add/remove routes, job payload integrity, and cross-module combos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

import {
  resolveTenantModules,
  shouldProvisionFinanceStack,
  getProvisionStackPlan,
  hasAccountingAndPos,
  isPosOnlyModules,
  isModuleGatingEnabled,
} from "../../../infra/worker-service/src/module-stacks.js";

import {
  parseTenantModules,
  serializeTenantModules,
} from "../src/services/auth/stockix-product-token.js";

import { tenantHasLicensedModule } from "../src/lib/tenant-module-access.js";
import { registerTenantModulesRoutes } from "../src/tenant-modules-http.js";

// ─── HTTP route mocks ────────────────────────────────────────────────────────
const insertTenantJob = vi.fn();
const syncFinanceLicense = vi.fn();

vi.mock("../src/services/tenant-jobs.js", () => ({
  insertTenantJob: (...a: unknown[]) => insertTenantJob(...a),
}));
vi.mock("../src/audit.js", () => ({ logAudit: vi.fn() }));
vi.mock("../src/provision-trace.js", () => ({
  createProvisionTracer: () => ({ event: vi.fn(async () => undefined) }),
}));
vi.mock("../src/license-utils.js", () => ({
  getActiveLicenseForTenant: vi.fn(async () => ({ id: "lic-1" })),
}));
vi.mock("../src/finance-license.client.js", () => ({
  syncFinanceLicenseForStockixTenant: (...a: unknown[]) => syncFinanceLicense(...a),
}));

// ─── Shared gating helper ────────────────────────────────────────────────────
function withGating(value: string | undefined, fn: () => void) {
  const prev = process.env.PROVISION_MODULE_GATING;
  if (value === undefined) delete process.env.PROVISION_MODULE_GATING;
  else process.env.PROVISION_MODULE_GATING = value;
  try { fn(); } finally {
    if (prev === undefined) delete process.env.PROVISION_MODULE_GATING;
    else process.env.PROVISION_MODULE_GATING = prev;
  }
}

// ─── 1. Module resolution ────────────────────────────────────────────────────
describe("resolveTenantModules", () => {
  it.each([undefined, null, [], [""], ["  "]])(
    "defaults to [accounting] for: %o",
    (input) => {
      expect(resolveTenantModules(input as never)).toEqual(["accounting"]);
    },
  );

  it("preserves a single valid module", () => {
    expect(resolveTenantModules(["pos"])).toEqual(["pos"]);
    expect(resolveTenantModules(["pms"])).toEqual(["pms"]);
    expect(resolveTenantModules(["chat"])).toEqual(["chat"]);
    expect(resolveTenantModules(["accounting"])).toEqual(["accounting"]);
  });

  it("preserves multi-module lists", () => {
    expect(resolveTenantModules(["accounting", "pos", "pms", "chat"])).toEqual([
      "accounting", "pos", "pms", "chat",
    ]);
  });

  it("passes through unknown keys (filtering happens in parseTenantModules, not resolveTenantModules)", () => {
    // resolveTenantModules trusts the caller; parseTenantModules is the sanitizing boundary
    const result = resolveTenantModules(["accounting", "stripe", "unknown"] as never);
    expect(result).toContain("accounting");
  });
});

// ─── 2. parseTenantModules / serializeTenantModules data integrity ───────────
describe("parseTenantModules — data integrity", () => {
  it.each([null, undefined, "", "null", "not-json"])(
    "falls back to [accounting] for bad input: %o",
    (input) => {
      expect(parseTenantModules(input as never)).toEqual(["accounting"]);
    },
  );

  it("parses all 4 valid modules from JSON", () => {
    const json = JSON.stringify(["accounting", "pos", "pms", "chat"]);
    expect(parseTenantModules(json)).toEqual(["accounting", "pos", "pms", "chat"]);
  });

  it("silently drops unknown module names", () => {
    const json = JSON.stringify(["accounting", "unknown_module", "pos"]);
    expect(parseTenantModules(json)).toEqual(["accounting", "pos"]);
  });

  it("round-trips through serializeTenantModules", () => {
    const modules = ["accounting", "pos", "pms", "chat"] as const;
    const json = serializeTenantModules([...modules]);
    expect(parseTenantModules(json)).toEqual([...modules]);
  });

  it("round-trips single module correctly", () => {
    for (const mod of ["accounting", "pos", "pms", "chat"] as const) {
      expect(parseTenantModules(serializeTenantModules([mod]))).toEqual([mod]);
    }
  });
});

// ─── 3. Stack plan — all module combos ──────────────────────────────────────
describe("getProvisionStackPlan — all module combinations", () => {
  beforeEach(() => delete process.env.PROVISION_MODULE_GATING);
  afterEach(() => delete process.env.PROVISION_MODULE_GATING);

  const cases: Array<[string[], { finance: boolean; pos: boolean; pms: boolean; chat: boolean }]> = [
    // Single modules
    [["accounting"],          { finance: true,  pos: false, pms: false, chat: false }],
    [["pos"],                 { finance: false, pos: true,  pms: false, chat: false }],
    [["pms"],                 { finance: false, pos: false, pms: true,  chat: false }],
    [["chat"],                { finance: false, pos: false, pms: false, chat: true  }],
    // Pairs
    [["accounting", "pos"],   { finance: true,  pos: true,  pms: false, chat: false }],
    [["accounting", "pms"],   { finance: true,  pos: false, pms: true,  chat: false }],
    [["accounting", "chat"],  { finance: true,  pos: false, pms: false, chat: true  }],
    [["pos", "pms"],          { finance: false, pos: true,  pms: true,  chat: false }],
    [["pos", "chat"],         { finance: false, pos: true,  pms: false, chat: true  }],
    [["pms", "chat"],         { finance: false, pos: false, pms: true,  chat: true  }],
    // Triples
    [["accounting", "pos", "pms"],  { finance: true,  pos: true,  pms: true,  chat: false }],
    [["accounting", "pos", "chat"], { finance: true,  pos: true,  pms: false, chat: true  }],
    [["accounting", "pms", "chat"], { finance: true,  pos: false, pms: true,  chat: true  }],
    [["pos", "pms", "chat"],        { finance: false, pos: true,  pms: true,  chat: true  }],
    // All 4
    [["accounting", "pos", "pms", "chat"], { finance: true, pos: true, pms: true, chat: true }],
  ];

  it.each(cases)("modules=%j → plan=%j", (modules, expected) => {
    expect(getProvisionStackPlan(modules)).toEqual(expected);
  });

  it("empty modules defaults to Finance only (accounting fallback)", () => {
    expect(getProvisionStackPlan([])).toEqual({
      finance: true, pos: false, pms: false, chat: false,
    });
  });

  it("PROVISION_MODULE_GATING=0 forces Finance even for POS-only tenants", () => {
    withGating("0", () => {
      const plan = getProvisionStackPlan(["pos"]);
      expect(plan.finance).toBe(true);
      expect(plan.pos).toBe(true);
    });
  });

  it("PROVISION_MODULE_GATING=1 (default) gates Finance behind accounting", () => {
    withGating("1", () => {
      expect(getProvisionStackPlan(["pos"]).finance).toBe(false);
      expect(getProvisionStackPlan(["pms"]).finance).toBe(false);
      expect(getProvisionStackPlan(["chat"]).finance).toBe(false);
      expect(getProvisionStackPlan(["accounting"]).finance).toBe(true);
    });
  });
});

// ─── 4. Derived module helpers ───────────────────────────────────────────────
describe("shouldProvisionFinanceStack", () => {
  it("true only when accounting is present", () => {
    expect(shouldProvisionFinanceStack(["accounting"])).toBe(true);
    expect(shouldProvisionFinanceStack(["accounting", "pos", "pms", "chat"])).toBe(true);
    expect(shouldProvisionFinanceStack(["pos"])).toBe(false);
    expect(shouldProvisionFinanceStack(["pms"])).toBe(false);
    expect(shouldProvisionFinanceStack(["chat"])).toBe(false);
    // empty/null/undefined resolve to ["accounting"] default → Finance IS started
    expect(shouldProvisionFinanceStack([])).toBe(true);
    expect(shouldProvisionFinanceStack(null)).toBe(true);
    expect(shouldProvisionFinanceStack(undefined)).toBe(true);
  });
});

describe("hasAccountingAndPos — Finance↔POS bridge trigger", () => {
  it("true only when BOTH accounting and pos are present", () => {
    expect(hasAccountingAndPos(["accounting", "pos"])).toBe(true);
    expect(hasAccountingAndPos(["accounting", "pos", "pms", "chat"])).toBe(true);
    expect(hasAccountingAndPos(["accounting"])).toBe(false);
    expect(hasAccountingAndPos(["pos"])).toBe(false);
    expect(hasAccountingAndPos(["pms", "chat"])).toBe(false);
  });
});

describe("isPosOnlyModules — POS standalone mode", () => {
  it("true only when pos is present and accounting is absent", () => {
    expect(isPosOnlyModules(["pos"])).toBe(true);
    expect(isPosOnlyModules(["pos", "pms"])).toBe(true);
    expect(isPosOnlyModules(["pos", "chat"])).toBe(true);
    expect(isPosOnlyModules(["accounting", "pos"])).toBe(false);
    expect(isPosOnlyModules(["accounting"])).toBe(false);
    expect(isPosOnlyModules([])).toBe(false);
  });
});

describe("isModuleGatingEnabled", () => {
  afterEach(() => delete process.env.PROVISION_MODULE_GATING);

  it("enabled by default", () => {
    delete process.env.PROVISION_MODULE_GATING;
    expect(isModuleGatingEnabled()).toBe(true);
  });

  it("disabled only with explicit =0", () => {
    process.env.PROVISION_MODULE_GATING = "0";
    expect(isModuleGatingEnabled()).toBe(false);
  });

  it("enabled with =1", () => {
    process.env.PROVISION_MODULE_GATING = "1";
    expect(isModuleGatingEnabled()).toBe(true);
  });
});

// ─── 5. License access control ───────────────────────────────────────────────
describe("tenantHasLicensedModule — access control per module", () => {
  const ALL_MODULES = ["accounting", "pos", "pms", "chat"] as const;

  it("allows access when tenant and license both include the module", () => {
    for (const mod of ALL_MODULES) {
      const result = tenantHasLicensedModule(
        JSON.stringify([mod]),
        [mod],
        mod,
      );
      expect(result.ok).toBe(true);
    }
  });

  it("denies when tenant modules list excludes the module", () => {
    const result = tenantHasLicensedModule(
      JSON.stringify(["accounting"]),
      ["accounting", "pos"],
      "pos",
    );
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("pos") });
  });

  it("denies when license excludes the module even if tenant has it", () => {
    const result = tenantHasLicensedModule(
      JSON.stringify(["accounting", "pos"]),
      ["accounting"],
      "pos",
    );
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("pos") });
  });

  it("allows when license is null (no license check performed)", () => {
    const result = tenantHasLicensedModule(
      JSON.stringify(["pms"]),
      null,
      "pms",
    );
    expect(result.ok).toBe(true);
  });

  it("denies access for all modules when tenant has empty/null modules JSON", () => {
    for (const mod of ALL_MODULES) {
      const result = tenantHasLicensedModule(null, null, mod);
      if (mod === "accounting") {
        // accounting is the default fallback — access is allowed
        expect(result.ok).toBe(true);
      } else {
        expect(result.ok).toBe(false);
      }
    }
  });
});

// ─── 6. HTTP add-module route — all 4 modules ────────────────────────────────
describe("POST /tenants/:id/add-module — all modules", () => {
  const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  function buildDb(currentModulesJson = '["accounting"]') {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{
              id: tenantId, slug: "acme", name: "Acme",
              adminEmail: "admin@acme.com", planSlug: "starter",
              modules: currentModulesJson, status: "active", financeTenantId: 1,
            }]),
          })),
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{
                id: tenantId, slug: "acme",
                modules: currentModulesJson, financeTenantId: 1,
              }]),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      })),
    };
  }

  function buildApp(db: ReturnType<typeof buildDb>) {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("actorId", "owner-1");
      c.set("actorRole", "super_admin");
      await next();
    });
    registerTenantModulesRoutes(app as never, db as never);
    return app;
  }

  beforeEach(() => {
    insertTenantJob.mockReset().mockResolvedValue({ id: "job-1" });
    syncFinanceLicense.mockReset().mockResolvedValue(undefined);
  });

  it.each(["pos", "pms", "chat"] as const)(
    "enqueues add_module job for module=%s",
    async (mod) => {
      const app = buildApp(buildDb());
      const res = await app.request(`http://local/tenants/${tenantId}/add-module`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: mod }),
      });
      expect(res.status).toBe(202);
      const body = await res.json() as { accepted: boolean; module: string };
      expect(body.accepted).toBe(true);
      expect(body.module).toBe(mod);
      expect(insertTenantJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: "add_module",
          tenantId,
          payload: expect.objectContaining({ module: mod }),
        }),
      );
    },
  );

  it("rejects adding a module already present", async () => {
    const app = buildApp(buildDb('["accounting","pos"]'));
    const res = await app.request(`http://local/tenants/${tenantId}/add-module`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "pos" }),
    });
    expect(res.status).toBe(400);
    expect(insertTenantJob).not.toHaveBeenCalled();
  });

  it("rejects unknown module keys", async () => {
    const app = buildApp(buildDb());
    const res = await app.request(`http://local/tenants/${tenantId}/add-module`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "stripe" }),
    });
    expect(res.status).toBe(400);
    expect(insertTenantJob).not.toHaveBeenCalled();
  });
});

// ─── 7. HTTP remove-module route — all 4 modules ─────────────────────────────
describe("POST /tenants/:id/remove-module — all modules", () => {
  const tenantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const ALL_FOUR = '["accounting","pos","pms","chat"]';

  function buildDb(currentModulesJson = ALL_FOUR) {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{
              id: tenantId, slug: "acme", name: "Acme",
              adminEmail: "admin@acme.com", planSlug: "starter",
              modules: currentModulesJson, status: "active", financeTenantId: 1,
            }]),
          })),
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{
                id: tenantId, slug: "acme",
                modules: currentModulesJson, financeTenantId: 1,
              }]),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      })),
    };
  }

  function buildApp(db: ReturnType<typeof buildDb>) {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("actorId", "owner-1");
      c.set("actorRole", "super_admin");
      await next();
    });
    registerTenantModulesRoutes(app as never, db as never);
    return app;
  }

  beforeEach(() => {
    insertTenantJob.mockReset().mockResolvedValue({ id: "job-1" });
    syncFinanceLicense.mockReset().mockResolvedValue(undefined);
  });

  it.each(["pos", "pms", "chat"] as const)(
    "removes module=%s: enqueues remove_module job and syncs license",
    async (mod) => {
      const app = buildApp(buildDb());
      const res = await app.request(`http://local/tenants/${tenantId}/remove-module`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: mod }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
      expect(insertTenantJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: "remove_module",
          payload: expect.objectContaining({ module: mod }),
        }),
      );
      expect(syncFinanceLicense).toHaveBeenCalled();
    },
  );

  it("rejects removing a module not on the tenant", async () => {
    const app = buildApp(buildDb('["accounting"]'));
    const res = await app.request(`http://local/tenants/${tenantId}/remove-module`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "pos" }),
    });
    expect(res.status).toBe(400);
    expect(insertTenantJob).not.toHaveBeenCalled();
  });
});

// ─── 8. Job payload data integrity ──────────────────────────────────────────
describe("add_module job payload — data sent to worker", () => {
  const tenantId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  function buildDb(mod: string) {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{
              id: tenantId, slug: "demo-corp", name: "Demo Corp",
              adminEmail: "admin@demo.com", planSlug: "pro",
              modules: JSON.stringify(["accounting"]), status: "active", financeTenantId: 99,
            }]),
          })),
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{
                id: tenantId, slug: "demo-corp",
                modules: JSON.stringify(["accounting"]), financeTenantId: 99,
              }]),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      })),
    };
  }

  beforeEach(() => {
    insertTenantJob.mockReset().mockResolvedValue({ id: "job-1" });
    syncFinanceLicense.mockReset().mockResolvedValue(undefined);
  });

  it.each(["pos", "pms", "chat"] as const)(
    "payload for add_%s contains slug, module, tenantId",
    async (mod) => {
      const db = buildDb(mod);
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("actorId", "owner-1");
        c.set("actorRole", "super_admin");
        await next();
      });
      registerTenantModulesRoutes(app as never, db as never);

      await app.request(`http://local/tenants/${tenantId}/add-module`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: mod }),
      });

      expect(insertTenantJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: "add_module",
          tenantId,
          payload: expect.objectContaining({
            module: mod,
            slug: "demo-corp",
          }),
        }),
      );
    },
  );
});
