import { describe, expect, it } from "vitest";

import { shouldPosOnlyRetryFailJob } from "../../../infra/worker-service/domain/provisioning/provision-outcome-rules.js";

describe("retry-provision partial rules", () => {
  it("classifies retry module flags", () => {
    const retryModules = ["wire"];
    const retryWireOnly =
      retryModules.includes("wire") && retryModules.length === 1;
    const retryPosOnly =
      retryModules.includes("pos") && retryModules.length === 1;
    expect(retryWireOnly).toBe(true);
    expect(retryPosOnly).toBe(false);
  });

  it("POS-only retry failure must fail the lifecycle job", () => {
    const retryModules = ["pos"];
    const posOnlyRetry =
      retryModules.includes("pos") && retryModules.length === 1;
    expect(posOnlyRetry).toBe(true);
    expect(
      shouldPosOnlyRetryFailJob({ posOnlyRetry: true, posStatus: "failed" }),
    ).toBe(true);
  });
});
