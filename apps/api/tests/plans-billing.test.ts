import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRbacMiddleware } from "../src/middleware/rbac.js";
import { parsePlanFeatures, serializePlanRow } from "../src/license-http.js";

vi.mock("../src/audit.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

const PLAN_ID = "11111111-1111-4111-8111-111111111111";

function basePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    name: "Starter",
    slug: "starter",
    description: null,
    maxOrganizations: 1,
    maxActivations: 5,
    isActive: true,
    sortOrder: 0,
    priceMonthly: null,
    priceAnnually: null,
    currency: "USD",
    billingInterval: null,
    isPublic: false,
    features: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createRbacOwnerDb(role: string) {
  const limit = vi.fn().mockResolvedValue([
    { id: "owner-1", role, status: "active", sessionVersion: 1 },
  ]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select } as never;
}

async function buildPlansApp(db: unknown) {
  const { registerLicenseApi } = await import("../src/license-http.js");
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("actorId", "owner-1");
    c.set("actorRole", "super_admin");
    await next();
  });
  app.use("*", createRbacMiddleware(createRbacOwnerDb("super_admin")));
  registerLicenseApi(app, db as never);
  return app;
}

describe("serializePlanRow", () => {
  it("parses features JSON and formats price display", () => {
    const row = basePlan({
      priceMonthly: 4900,
      features: JSON.stringify(["5 organizations", "API access"]),
      billingInterval: "monthly",
    });
    const out = serializePlanRow(row);
    expect(out.priceMonthly).toBe(4900);
    expect(out.features).toEqual(["5 organizations", "API access"]);
    expect(out.priceMonthlyDisplay).toBe("49.00 USD");
  });

  it("returns empty features and null display when pricing unset", () => {
    const out = serializePlanRow(basePlan());
    expect(out.features).toEqual([]);
    expect(out.priceMonthlyDisplay).toBeNull();
  });
});

describe("parsePlanFeatures", () => {
  it("returns empty array for invalid JSON", () => {
    expect(parsePlanFeatures("{not-json")).toEqual([]);
  });
});

describe("Plan billing fields API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates plan with pricing fields", async () => {
    const created = basePlan({
      name: "Pro Plan",
      slug: "pro-v2",
      priceMonthly: 4900,
      priceAnnually: 49900,
      billingInterval: "monthly",
      isPublic: true,
      features: JSON.stringify(["5 organizations", "API access"]),
    });

    const slugLimit = vi.fn().mockResolvedValue([]);
    const insertReturning = vi.fn().mockResolvedValue([created]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));
    const insert = vi.fn(() => ({ values: insertValues }));

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: slugLimit })),
        })),
      })),
      insert,
    };

    const app = await buildPlansApp(db);
    const res = await app.request("http://local/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Pro Plan",
        slug: "pro-v2",
        maxOrganizations: 5,
        maxActivations: 10,
        priceMonthly: 4900,
        priceAnnually: 49900,
        currency: "USD",
        billingInterval: "monthly",
        isPublic: true,
        features: ["5 organizations", "API access"],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.plan.priceMonthly).toBe(4900);
    expect(body.plan.features).toEqual(["5 organizations", "API access"]);
    expect(body.plan.priceMonthlyDisplay).toBe("49.00 USD");
  });

  it("creates plan without pricing fields", async () => {
    const created = basePlan({
      name: "Enterprise",
      slug: "enterprise-v2",
      maxOrganizations: -1,
      maxActivations: 50,
    });

    const slugLimit = vi.fn().mockResolvedValue([]);
    const insertReturning = vi.fn().mockResolvedValue([created]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));
    const insert = vi.fn(() => ({ values: insertValues }));

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: slugLimit })),
        })),
      })),
      insert,
    };

    const app = await buildPlansApp(db);
    const res = await app.request("http://local/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Enterprise",
        slug: "enterprise-v2",
        maxOrganizations: -1,
        maxActivations: 50,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.plan.priceMonthly).toBeNull();
    expect(body.plan.priceMonthlyDisplay).toBeNull();
    expect(body.plan.features).toEqual([]);
  });

  it("GET /plans returns pricing fields", async () => {
    const row = basePlan({ priceMonthly: 2900, billingInterval: "monthly" });
    const orderBy = vi.fn().mockResolvedValue([row]);
    const groupBy = vi.fn().mockResolvedValue([]);

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: vi.fn(() => ({ orderBy })) })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({ groupBy })),
          })),
        }),
    };

    const app = await buildPlansApp(db);
    const res = await app.request("http://local/plans");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans[0]).toHaveProperty("priceMonthly");
    expect(body.plans[0]).toHaveProperty("features");
    expect(body.plans[0]).toHaveProperty("priceMonthlyDisplay");
    expect(body.plans[0].priceMonthlyDisplay).toBe("29.00 USD");
  });

  it("updates plan pricing", async () => {
    const existing = basePlan({ slug: "patch-me", priceMonthly: 2900 });
    const updated = basePlan({ slug: "patch-me", priceMonthly: 3900, billingInterval: "monthly" });

    const selectLimit = vi.fn().mockResolvedValueOnce([existing]);
    const updateReturning = vi.fn().mockResolvedValue([updated]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set: updateSet }));

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: selectLimit })),
        })),
      })),
      update,
    };

    const app = await buildPlansApp(db);
    const res = await app.request(`http://local/plans/${PLAN_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceMonthly: 3900 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan.priceMonthly).toBe(3900);
    expect(body.plan.priceMonthlyDisplay).toBe("39.00 USD");
  });
});
