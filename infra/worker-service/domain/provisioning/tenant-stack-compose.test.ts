import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getRepoRoot } from "../repo-root.js";

describe("tenant-stack docker-compose.yml", () => {
  const composeText = readFileSync(
    join(getRepoRoot(), "infra", "tenant-stack", "docker-compose.yml"),
    "utf8",
  );

  it("binds server to PUBLIC_PROXY_PORT instead of ephemeral host port", () => {
    expect(composeText).toContain('"0.0.0.0:${PUBLIC_PROXY_PORT}:3000"');
    expect(composeText).not.toContain('"0.0.0.0::3000"');
  });

  it("requires database_migration before server for manual compose up", () => {
    expect(composeText).toContain("depends_on:");
    expect(composeText).toContain("database_migration:");
    expect(composeText).toContain("condition: service_completed_successfully");
  });

  it("does not use fake always-healthy migration healthcheck", () => {
    const migrationBlock = composeText.slice(composeText.indexOf("database_migration:"));
    expect(migrationBlock).not.toContain('test: ["CMD-SHELL", "exit 0"]');
  });
});
