import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getRepoRoot } from "../repo-root.js";

describe("tenant-stack docker-compose.dev.yml", () => {
  const devComposeText = readFileSync(
    join(getRepoRoot(), "infra", "tenant-stack", "docker-compose.dev.yml"),
    "utf8",
  );

  it("adds build targets for local dev", () => {
    expect(devComposeText).toContain("target: app");
    expect(devComposeText).toContain("target: migration");
  });
});
