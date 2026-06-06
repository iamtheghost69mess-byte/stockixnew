import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

import { execa } from "execa";

import { ensureSharedMongoReplicaSetReady } from "./provisioner.js";

describe("ensureSharedMongoReplicaSetReady", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs stockix-mongo-rs-init via shared compose project", async () => {
    vi.mocked(execa).mockResolvedValue({
      exitCode: 0,
      stdout: "[rs-init] replica set rs0 is PRIMARY — ready",
      stderr: "",
    } as Awaited<ReturnType<typeof execa>>);

    const logs: string[] = [];
    await ensureSharedMongoReplicaSetReady((msg) => logs.push(msg));

    expect(execa).toHaveBeenCalledTimes(1);
    const [cmd, args] = vi.mocked(execa).mock.calls[0] ?? [];
    expect(cmd).toBe("docker");
    expect(args?.[0]).toBe("compose");
    expect(args?.[1]).toBe("-f");
    expect(String(args?.[2]).replace(/\\/g, "/")).toContain("infra/shared/docker-compose.yml");
    expect(args).toContain("-p");
    expect(args).toContain("stockix-shared");
    expect(args).toContain("run");
    expect(args).toContain("--rm");
    expect(args).toContain("stockix-mongo-rs-init");
    expect(logs.some((line) => line.includes("rs0 is PRIMARY"))).toBe(true);
  });

  it("throws when rs-init exits non-zero", async () => {
    vi.mocked(execa).mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "[rs-init] ERROR: replica set did not reach PRIMARY in time",
    } as Awaited<ReturnType<typeof execa>>);

    await expect(
      ensureSharedMongoReplicaSetReady(() => undefined),
    ).rejects.toThrow("[db-provision] mongo rs0 not ready");
  });
});
