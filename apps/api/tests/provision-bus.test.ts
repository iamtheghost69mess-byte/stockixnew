import { describe, expect, it, vi } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import { subscribeProvision } from "../src/provision-bus.js";
import { createProvisionTracer } from "../src/provision-trace.js";

describe("provision bus", () => {
  it("createProvisionTracer emits after insert returning", async () => {
    const correlationId = "corr-11111111-1111-1111-1111-111111111111";
    const createdAt = new Date("2026-05-26T12:00:00.000Z");
    const row = {
      id: "evt-11111111-1111-1111-1111-111111111111",
      createdAt,
    };

    const returning = vi.fn().mockResolvedValue([row]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert } as unknown as PostgresJsDatabase<typeof schema>;

    const received: Array<{ phase: string }> = [];
    const unsubscribe = subscribeProvision(correlationId, (payload) => {
      received.push(payload);
    });

    const trace = createProvisionTracer(
      db,
      correlationId,
      () => ({ slug: "acme", tenantId: "tenant-1" }),
      () => undefined,
    );
    await trace.event("queued", "Job queued");

    unsubscribe();

    expect(insert).toHaveBeenCalled();
    expect(received).toHaveLength(1);
    expect(received[0]?.phase).toBe("queued");
  });
});
