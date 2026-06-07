import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetClient = vi.fn();

vi.mock("@repo/config", () => ({
  apiConfig: { nodeEnv: "production" },
}));

vi.mock("../src/lib/redis.js", () => ({
  getControlPlaneRedisClient: () => mockGetClient(),
}));

describe("publishProvisionEvent production hardening", () => {
  afterEach(() => {
    vi.resetModules();
    mockGetClient.mockReset();
  });

  it("throws in production when Redis client is unavailable", async () => {
    mockGetClient.mockReturnValue(null);
    vi.doMock("@repo/config", () => ({
      apiConfig: { nodeEnv: "production" },
    }));
    const { publishProvisionEvent } = await import("../src/lib/provision-pubsub.js");
    await expect(
      publishProvisionEvent({
        id: "evt-1",
        correlationId: "corr-1",
        phase: "progress",
        level: "info",
        message: "test",
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/provision_pubsub_redis_unavailable/);
  });

  it("uses local bus in development when Redis client is unavailable", async () => {
    mockGetClient.mockReturnValue(null);
    vi.doMock("@repo/config", () => ({
      apiConfig: { nodeEnv: "development" },
    }));
    const { publishProvisionEvent, subscribeProvisionEvents } = await import(
      "../src/lib/provision-pubsub.js"
    );
    const received: string[] = [];
    const unsub = subscribeProvisionEvents(
      "corr-dev",
      (p) => {
        received.push(p.id);
      },
      () => undefined,
    );
    await publishProvisionEvent({
      id: "evt-dev",
      correlationId: "corr-dev",
      phase: "progress",
      level: "info",
      message: "dev",
      createdAt: new Date().toISOString(),
    });
    unsub();
    expect(received).toEqual(["evt-dev"]);
  });
});
