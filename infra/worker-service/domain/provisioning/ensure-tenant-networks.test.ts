import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ensureTenantExternalNetworks } from "./ensure-tenant-networks.js";

const execaMock = vi.hoisted(() => vi.fn());

vi.mock("execa", () => ({
  execa: execaMock,
}));

describe("ensureTenantExternalNetworks", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    execaMock.mockReset();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("auto-creates missing networks in non-production", async () => {
    process.env.NODE_ENV = "development";
    execaMock.mockImplementation((_cmd: string, args?: string[]) => {
      if (args?.[0] === "network" && args[1] === "inspect") {
        return Promise.reject(new Error("not found"));
      }
      if (args?.[0] === "network" && args[1] === "create") {
        return Promise.resolve({ stdout: "" });
      }
      return Promise.reject(new Error("unexpected execa call"));
    });
    const logs: string[] = [];
    await ensureTenantExternalNetworks((m) => logs.push(m));
    expect(logs.some((l) => l.includes("creating Docker network"))).toBe(true);
  });

  it("fails in production when stockix_public is missing", async () => {
    process.env.NODE_ENV = "production";
    execaMock.mockRejectedValue(new Error("not found"));
    await expect(
      ensureTenantExternalNetworks(() => undefined),
    ).rejects.toThrow(/stockix-shared is missing/);
  });
});
