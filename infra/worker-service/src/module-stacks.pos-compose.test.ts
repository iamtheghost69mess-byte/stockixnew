import { describe, expect, it } from "vitest";

import { resolvePosTenantEnvPath } from "./module-stacks.js";

describe("resolvePosTenantEnvPath", () => {
  it("ends with slug/.env under tenant env root", () => {
    const path = resolvePosTenantEnvPath("acme-corp");
    expect(path.replace(/\\/g, "/")).toMatch(/acme-corp\/\.env$/);
  });
});
