import { describe, expect, it, vi } from "vitest";

const execaMock = vi.fn();

vi.mock("execa", () => ({
  execa: (...args: unknown[]) => execaMock(...args),
}));

describe("assertFinanceStackStopped", () => {
  it("throws when finance project containers are still running", async () => {
    execaMock.mockResolvedValueOnce({ stdout: "stockix-acme-server-1\n" });
    const { assertFinanceStackStopped } = await import("./provisioner.js");
    await expect(assertFinanceStackStopped("stockix-acme")).rejects.toThrow(
      /still has running containers/,
    );
  });

  it("passes when no containers match the project", async () => {
    execaMock.mockResolvedValueOnce({ stdout: "" });
    const { assertFinanceStackStopped } = await import("./provisioner.js");
    await expect(assertFinanceStackStopped("stockix-acme")).resolves.toBeUndefined();
  });
});
