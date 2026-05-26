import { describe, expect, it } from "vitest";

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
});
