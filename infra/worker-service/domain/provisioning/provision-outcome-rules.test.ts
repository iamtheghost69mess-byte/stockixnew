import { describe, expect, it } from "vitest";

import {
  resolveProvisionJobOutcome,
  shouldPosOnlyRetryFailJob,
} from "./provision-outcome-rules.js";

describe("resolveProvisionJobOutcome", () => {
  it("returns failed when ok is false", () => {
    expect(resolveProvisionJobOutcome({ ok: false })).toBe("failed");
  });

  it("returns partial when tenantStatus is partial", () => {
    expect(
      resolveProvisionJobOutcome({ ok: true, tenantStatus: "partial" }),
    ).toBe("partial");
  });

  it("returns success for active tenant", () => {
    expect(resolveProvisionJobOutcome({ ok: true, tenantStatus: "active" })).toBe(
      "success",
    );
  });
});

describe("shouldPosOnlyRetryFailJob", () => {
  it("requires job failure on POS-only retry when POS failed", () => {
    expect(
      shouldPosOnlyRetryFailJob({ posOnlyRetry: true, posStatus: "failed" }),
    ).toBe(true);
  });

  it("does not fail job when POS-only retry succeeds", () => {
    expect(shouldPosOnlyRetryFailJob({ posOnlyRetry: true, posStatus: "ok" })).toBe(
      false,
    );
  });

  it("does not fail full provision when POS failed but not POS-only retry", () => {
    expect(
      shouldPosOnlyRetryFailJob({ posOnlyRetry: false, posStatus: "failed" }),
    ).toBe(false);
  });
});
