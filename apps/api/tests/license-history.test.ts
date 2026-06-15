import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRbacMiddleware } from "../src/middleware/rbac.js";
import {
  insertLicenseHistory,
  parseLicenseHistoryJson,
} from "../src/license-utils.js";

vi.mock("../src/audit.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/license-finance-sync.js", () => ({
  triggerFinanceLicenseSync: vi.fn().mockResolvedValue(undefined),
}));

const LICENSE_ID = "11111111-1111-4111-8111-111111111111";

function createRbacOwnerDb(role: string) {
  const limit = vi.fn().mockResolvedValue([
    { id: "owner-1", role, status: "active", sessionVersion: 1 },
  ]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select } as never;
}

describe("insertLicenseHistory", () => {
  it("never throws on DB error", async () => {
    const insert = vi.fn(() => {
      throw new Error("db down");
    });
    const db = { insert } as never;
    await expect(
      insertLicenseHistory(db, {
        licenseId: "00000000-0000-4000-8000-000000000000",
        action: "generated",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("parseLicenseHistoryJson", () => {
  it("returns null for invalid JSON", () => {
    expect(parseLicenseHistoryJson("{bad")).toBeNull();
  });
});

describe("GET /licenses/:licenseId/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without actor (RBAC)", async () => {
    const { registerLicenseApi } = await import("../src/license-http.js");
    const app = new Hono();
    app.use("*", createRbacMiddleware(createRbacOwnerDb("read_only")));
    registerLicenseApi(app, {} as never);

    const res = await app.request(`http://local/licenses/${LICENSE_ID}/history`);
    expect(res.status).toBe(401);
  });

  it("returns history rows with parsed JSON", async () => {
    const historyRow = {
      id: "hist-11111111-1111-4111-8111-111111111111",
      licenseId: LICENSE_ID,
      actorId: "owner-1",
      actorEmail: "admin@test.com",
      action: "generated",
      previousValues: null,
      newValues: JSON.stringify({ planSlug: "starter" }),
      notes: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    };

    const licenseLimit = vi.fn().mockResolvedValue([{ id: LICENSE_ID }]);
    const historyLimit = vi.fn().mockResolvedValue([historyRow]);
    const historyOffset = vi.fn().mockResolvedValue([historyRow]);
    const historyOrderBy = vi.fn(() => ({
      limit: vi.fn(() => ({ offset: historyOffset })),
    }));
    const historyWhere = vi.fn(() => ({ orderBy: historyOrderBy }));
    const historyFrom = vi.fn(() => ({ where: historyWhere }));

    const countWhere = vi.fn().mockResolvedValue([{ c: 1 }]);
    const countFrom = vi.fn(() => ({ where: countWhere }));

    let selectCall = 0;
    const select = vi.fn(() => {
      selectCall++;
      if (selectCall === 1) {
        return { from: vi.fn(() => ({ where: vi.fn(() => ({ limit: licenseLimit })) })) };
      }
      if (selectCall === 2) {
        return { from: historyFrom };
      }
      return { from: countFrom };
    });

    const db = { select };

    const { registerLicenseApi } = await import("../src/license-http.js");
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("actorId", "owner-1");
      c.set("actorRole", "read_only");
      await next();
    });
    app.use("*", createRbacMiddleware(createRbacOwnerDb("read_only")));
    registerLicenseApi(app, db as never);

    const res = await app.request(`http://local/licenses/${LICENSE_ID}/history`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history).toHaveLength(1);
    expect(body.history[0].action).toBe("generated");
    expect(body.history[0].newValues).toEqual({ planSlug: "starter" });
    expect(body.pagination.total).toBe(1);
  });
});
