import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRbacMiddleware } from "../src/middleware/rbac.js";

const repoRoot = join(process.cwd(), "..", "..");
const indexSrc = readFileSync(join(repoRoot, "apps/api/src/index.ts"), "utf8");

const PLAN_ROW = {
  id: "plan-11111111-1111-1111-1111-111111111111",
  name: "Starter",
  slug: "starter",
  description: null,
  maxOrganizations: 1,
  maxActivations: 5,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function createPlansDbMock() {
  const orderBy = vi.fn().mockResolvedValue([PLAN_ROW]);
  const fromPlans = vi.fn(() => ({ orderBy }));
  const groupBy = vi.fn().mockResolvedValue([]);
  const whereLicenses = vi.fn(() => ({ groupBy }));
  const fromLicenses = vi.fn(() => ({ where: whereLicenses }));

  const select = vi
    .fn()
    .mockReturnValueOnce({ from: fromPlans })
    .mockReturnValueOnce({ from: fromLicenses });

  return { select } as never;
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

async function buildPlansApp(role: "read_only" | "super_admin", withActor: boolean) {
  const { registerLicenseApi } = await import("../src/license-http.js");
  const app = new Hono();
  if (withActor) {
    app.use("*", async (c, next) => {
      c.set("actorId", "owner-1");
      c.set("actorRole", role);
      await next();
    });
  }
  app.use("*", createRbacMiddleware(createRbacOwnerDb(role)));
  registerLicenseApi(app, createPlansDbMock());
  return app;
}

describe("GET /plans authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("index.ts does not bypass platform auth for GET /plans", () => {
    expect(indexSrc).not.toMatch(
      /pubMethod\s*===\s*"GET"\s*&&\s*pubPath\s*===\s*"\/plans"/,
    );
  });

  it("returns 401 when no actor is set (RBAC)", async () => {
    const app = await buildPlansApp("read_only", false);
    const res = await app.request("http://local/plans");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: "unauthorized_actor" });
  });

  it("returns plan list when authenticated as read_only", async () => {
    const app = await buildPlansApp("read_only", true);
    const res = await app.request("http://local/plans");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans).toBeDefined();
    expect(Array.isArray(body.plans)).toBe(true);
    expect(body.plans[0]).toMatchObject({ slug: "starter", name: "Starter" });
  });

  it("returns plan list when authenticated as super_admin", async () => {
    const app = await buildPlansApp("super_admin", true);
    const res = await app.request("http://local/plans");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans).toBeDefined();
  });
});
