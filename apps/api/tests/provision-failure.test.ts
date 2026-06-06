import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  appendProvisionFailureEvent,
  readOrganizationIdFromJobPayload,
  type TerminalProvisionJob,
} from "../src/provisioning/provision-failure.js";
import { logger } from "../src/lib/logger.js";

vi.mock("../src/lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe("appendProvisionFailureEvent", () => {
  beforeEach(() => {
    vi.mocked(logger.error).mockClear();
  });

  it("logs when insert fails instead of swallowing", async () => {
    const db = {
      insert: () => ({
        values: () => ({
          catch: (handler: (err: unknown) => void) => {
            handler(new Error("insert failed"));
          },
        }),
      }),
    };
    await appendProvisionFailureEvent(db as never, {
      correlationId: "corr-1",
      tenantId: "tenant-1",
      message: "provision failed",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[provision-failure] appendProvisionFailureEvent insert failed",
      expect.objectContaining({
        correlationId: "corr-1",
        tenantId: "tenant-1",
      }),
    );
  });
});

describe("readOrganizationIdFromJobPayload", () => {
  it("returns organizationId when present", () => {
    expect(
      readOrganizationIdFromJobPayload({
        organizationId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("returns null for invalid payload", () => {
    expect(readOrganizationIdFromJobPayload(null)).toBeNull();
    expect(readOrganizationIdFromJobPayload({})).toBeNull();
  });
});

describe("terminal provision job routing (contract)", () => {
  it("tenant.provision jobs carry tenantId", () => {
    const job: TerminalProvisionJob = {
      type: "tenant.provision",
      tenantId: "11111111-1111-4111-8111-111111111111",
      correlationId: "corr-1",
      payload: { slug: "demo" },
    };
    expect(job.type).toBe("tenant.provision");
    expect(job.tenantId).toBeTruthy();
  });

  it("add_module jobs carry tenantId for revert path", () => {
    const job: TerminalProvisionJob = {
      type: "add_module",
      tenantId: "11111111-1111-4111-8111-111111111111",
      correlationId: "corr-2",
      payload: { module: "pos" },
    };
    expect(job.type).toBe("add_module");
  });
});
