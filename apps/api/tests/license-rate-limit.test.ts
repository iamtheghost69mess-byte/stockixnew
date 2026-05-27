import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consumeMock = vi.fn();

vi.mock("rate-limiter-flexible", () => {
  class RateLimiterRes extends Error {
    msBeforeNext = 30_000;
    constructor() {
      super("rate limited");
      this.name = "RateLimiterRes";
    }
  }
  return {
    RateLimiterRes,
    RateLimiterMemory: class {
      consume = consumeMock;
    },
    RateLimiterRedis: class {
      consume = consumeMock;
    },
  };
});

vi.mock("../src/lib/redis.js", () => ({
  getControlPlaneRedisClient: vi.fn(() => ({})),
}));

describe("licenseActivateRateLimitMiddleware", () => {
  beforeEach(() => {
    consumeMock.mockReset();
    consumeMock.mockResolvedValue(undefined);
    vi.resetModules();
    delete process.env.NODE_ENV;
    delete process.env.CONTROL_PLANE_REDIS_URL;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 429 after IP limit exceeded", async () => {
    const { RateLimiterRes } = await import("rate-limiter-flexible");
    consumeMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new RateLimiterRes());

    const { licenseActivateRateLimitMiddleware } = await import(
      "../src/middleware/license-rate-limit.js"
    );
    const app = new Hono();
    app.use("/*", licenseActivateRateLimitMiddleware());
    app.post("/licenses/activate", (c) => c.json({ success: true }));

    const headers = { "x-forwarded-for": "203.0.113.50" };
    for (let i = 0; i < 5; i++) {
      const res = await app.request("http://localhost/licenses/activate", {
        method: "POST",
        headers,
      });
      expect(res.status).toBe(200);
    }
    const blocked = await app.request("http://localhost/licenses/activate", {
      method: "POST",
      headers,
    });
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error?: string };
    expect(body.error).toBe("invalid_license");
  });

  it("returns 503 when production requires Redis and limiter store errors", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CONTROL_PLANE_REDIS_URL", "redis://127.0.0.1:6379/0");
    consumeMock.mockRejectedValueOnce(new Error("redis down"));

    vi.resetModules();
    const { licenseActivateRateLimitMiddleware } = await import(
      "../src/middleware/license-rate-limit.js"
    );
    const app = new Hono();
    app.use("/*", licenseActivateRateLimitMiddleware());
    app.post("/licenses/activate", (c) => c.json({ success: true }));

    const res = await app.request("http://localhost/licenses/activate", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.51" },
    });
    expect(res.status).toBe(503);
  });
});
