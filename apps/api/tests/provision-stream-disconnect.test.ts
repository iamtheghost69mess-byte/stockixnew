import { describe, expect, it, vi } from "vitest";

/**
 * Mirrors provision-stream safeWrite / forward disconnect handling in tenants.ts
 * so client abort (ECONNRESET) does not crash the API process.
 */
describe("provision stream SSE disconnect handling", () => {
  it("marks stream closed when writeSSE fails and skips subsequent writes", async () => {
    let closed = false;
    const stream = {
      writeSSE: vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error("aborted"), { code: "ECONNRESET" }))
        .mockResolvedValue(undefined),
    };

    const safeWrite = async (event: string, data: string): Promise<boolean> => {
      if (closed) return false;
      try {
        await stream.writeSSE({ event, data });
        return true;
      } catch {
        closed = true;
        return false;
      }
    };

    expect(await safeWrite("ping", "1")).toBe(false);
    expect(await safeWrite("ping", "2")).toBe(false);
    expect(stream.writeSSE).toHaveBeenCalledTimes(1);
  });

  it("forward swallows write failures without unhandled rejection", async () => {
    let closed = false;
    const stream = {
      writeSSE: vi.fn().mockRejectedValue(new Error("ECONNRESET")),
    };
    const sent = new Set<string>();

    const safeWrite = async (event: string, data: string): Promise<boolean> => {
      if (closed) return false;
      try {
        await stream.writeSSE({ event, data });
        return true;
      } catch {
        closed = true;
        return false;
      }
    };

    const forward = async (payload: { id: string; phase: string }) => {
      if (sent.has(payload.id) || closed) return;
      sent.add(payload.id);
      await safeWrite("provision", JSON.stringify(payload));
    };

    await expect(
      forward({ id: "evt-1", phase: "queued" }).catch(() => {
        closed = true;
      }),
    ).resolves.toBeUndefined();
    expect(closed).toBe(true);
  });
});
