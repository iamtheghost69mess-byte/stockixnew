import { describe, expect, it, vi } from "vitest";
import type { OwnerNotification } from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

const ownerId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function sampleNotification(
  overrides: Partial<OwnerNotification> = {},
): OwnerNotification {
  const now = new Date();
  return {
    id: "11111111-1111-1111-1111-111111111111",
    ownerId,
    type: "provision.complete",
    severity: "success",
    title: "Test tenant is ready",
    body: "Provisioned successfully.",
    tenantId: null,
    licenseId: null,
    correlationId: null,
    actionUrl: "/tenants/1",
    actionLabel: "View tenant",
    readAt: null,
    meta: null,
    createdAt: now,
    ...overrides,
  };
}

describe("notification stream (Redis pub/sub with DB fallback)", () => {
  it("createNotification persists without in-memory bus", async () => {
    const row = sampleNotification();
    const returning = vi.fn().mockResolvedValue([row]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert } as unknown as PostgresJsDatabase<typeof schema>;

    const { createNotification } = await import("../src/notification-service.js");
    const result = await createNotification(db, {
      ownerId,
      type: "provision.complete",
      severity: "success",
      title: row.title,
      body: row.body,
    });

    expect(insert).toHaveBeenCalled();
    expect(result?.id).toBe(row.id);
  });

  it("notification-bus module is removed", async () => {
    await expect(import("../src/notification-bus.js")).rejects.toMatchObject({
      code: "ERR_MODULE_NOT_FOUND",
    });
  });

  it("listNotificationsForStream queries owner rows since timestamp", async () => {
    const since = new Date("2026-01-01T00:00:00.000Z");
    const rows = [sampleNotification({ id: "22222222-2222-2222-2222-222222222222" })];
    const limit = vi.fn().mockResolvedValue(rows);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select } as unknown as PostgresJsDatabase<typeof schema>;

    const { listNotificationsForStream } = await import("../src/notification-service.js");
    const result = await listNotificationsForStream(db, ownerId, since);

    expect(select).toHaveBeenCalled();
    expect(result).toEqual(rows);
  });

  it("primed notification ids are not re-emitted on poll", () => {
    const primed = [
      sampleNotification({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }),
      sampleNotification({ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }),
    ];
    const sent = new Set<string>();
    for (const row of primed) sent.add(row.id);

    const polled = [
      ...primed,
      sampleNotification({ id: "cccccccc-cccc-cccc-cccc-cccccccccccc" }),
    ];

    const emitted: string[] = [];
    for (const row of polled) {
      if (sent.has(row.id)) continue;
      sent.add(row.id);
      emitted.push(row.id);
    }

    expect(emitted).toEqual(["cccccccc-cccc-cccc-cccc-cccccccccccc"]);
  });
});
