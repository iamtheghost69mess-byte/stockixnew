import { describe, expect, it } from "vitest";

import { buildPreflightDownArgs } from "./build-preflight-down-args.js";

describe("buildPreflightDownArgs", () => {
  it("omits -v by default", () => {
    expect(buildPreflightDownArgs()).toEqual(["down", "--remove-orphans", "--timeout", "10"]);
    expect(buildPreflightDownArgs(false)).not.toContain("-v");
  });

  it("includes -v when cleanSlate is true", () => {
    expect(buildPreflightDownArgs(true)).toEqual([
      "down",
      "--remove-orphans",
      "-v",
      "--timeout",
      "10",
    ]);
  });
});
