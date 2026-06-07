import { describe, expect, it, vi } from "vitest";
import { maybeInjectProvisionTestFailure } from "./provision-runtime.js";

describe("maybeInjectProvisionTestFailure", () => {
  it("no-ops in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => maybeInjectProvisionTestFailure("e2e-fail-inject-x", "docker.data_step")).not.toThrow();
    vi.unstubAllEnvs();
  });

  it("throws for e2e-fail-inject slug after docker.data_step in non-production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => maybeInjectProvisionTestFailure("e2e-fail-inject-abc", "docker.data_step")).toThrow(
      /simulated worker crash/,
    );
    vi.unstubAllEnvs();
  });

  it("does not throw for normal slugs", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => maybeInjectProvisionTestFailure("e2e-fin-abc", "docker.data_step")).not.toThrow();
    vi.unstubAllEnvs();
  });
});
