import { describe, expect, it } from "vitest";

import {
  readOrganizationIdFromJobPayload,
  type TerminalProvisionJob,
} from "../src/provisioning/provision-failure.js";

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
