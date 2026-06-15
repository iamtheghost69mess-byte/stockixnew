import { describe, expect, it } from "vitest";
import { validateWorkerSecret } from "@repo/config";

const VALID_SECRET = "a".repeat(32);

describe("validateWorkerSecret", () => {
  it("allows development with default secret", () => {
    expect(() => validateWorkerSecret("development", "dev-worker-secret")).not.toThrow();
  });

  it("rejects dev-worker-secret in production", () => {
    expect(() => validateWorkerSecret("production", "dev-worker-secret")).toThrow(
      /WORKER_SECRET must be set/,
    );
  });

  it("rejects dev-worker-secret in staging", () => {
    expect(() => validateWorkerSecret("staging", "dev-worker-secret")).toThrow(
      /WORKER_SECRET must be set/,
    );
  });

  it("rejects short secrets in production", () => {
    expect(() => validateWorkerSecret("production", "short")).toThrow(/at least 32 characters/);
  });

  it("accepts valid secret in production", () => {
    expect(() => validateWorkerSecret("production", VALID_SECRET)).not.toThrow();
  });
});
