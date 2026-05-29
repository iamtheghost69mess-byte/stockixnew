import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { requiredApiRole } from "../src/middleware/rbac.js";
import { handleEmailLogsList } from "../src/routes/email-logs.js";

function createMockDb(rows: unknown[], total: number) {
  const dataChain = {
    leftJoin: vi.fn(function (this: typeof dataChain) {
      return this;
    }),
    orderBy: vi.fn(function (this: typeof dataChain) {
      return this;
    }),
    limit: vi.fn(function (this: typeof dataChain) {
      return this;
    }),
    offset: vi.fn(function (this: typeof dataChain) {
      return this;
    }),
    where: vi.fn().mockResolvedValue(rows),
    then: (
      onFulfilled: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(onFulfilled, onRejected),
  };

  const countChain = {
    where: vi.fn().mockResolvedValue([{ c: total }]),
    then: (
      onFulfilled: (value: { c: number }[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve([{ c: total }]).then(onFulfilled, onRejected),
  };

  const select = vi.fn((shape?: unknown) => {
    if (shape && typeof shape === "object" && "c" in (shape as object)) {
      return { from: vi.fn(() => countChain) };
    }
    return { from: vi.fn(() => dataChain) };
  });

  return { select } as never;
}

describe("GET /admin/email-logs", () => {
  it("returns paginated logs", async () => {
    const rows = [
      {
        id: "log-1",
        templateKey: "owner-invite",
        status: "sent",
        deliveryStatus: null,
        providerMessageId: "msg-1",
        error: null,
        tenantId: null,
        tenantSlug: null,
        tenantName: null,
        ownerId: null,
        idempotencyKey: null,
        createdAt: new Date("2026-05-01T12:00:00.000Z"),
      },
    ];
    const db = createMockDb(rows, 1);
    const app = new Hono();
    app.get("/admin/email-logs", (c) => handleEmailLogsList(c, db));

    const res = await app.request("/admin/email-logs?page=1&pageSize=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[]; total: number };
    expect(body.total).toBe(1);
    expect(body.logs).toHaveLength(1);
  });

  it("requires super_admin via rbac helper", () => {
    expect(requiredApiRole("/admin/email-logs", "GET")).toBe("super_admin");
  });
});
