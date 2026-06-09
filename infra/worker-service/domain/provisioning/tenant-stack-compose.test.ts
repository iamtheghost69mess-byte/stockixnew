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

  it("is image-only in production (no build stanzas)", () => {
    expect(composeText).not.toMatch(/^\s+build:/m);
  });

  it("sets NODE_ENV=production on Finance server", () => {
    expect(composeText).toContain("- NODE_ENV=production");
  });

  it("passes branding vars through server environment", () => {
    expect(composeText).toContain("REACT_APP_STOCKIX_API_URL=${REACT_APP_STOCKIX_API_URL:-}");
    expect(composeText).toContain("REACT_APP_STOCKIX_PRIMARY_COLOR=${REACT_APP_STOCKIX_PRIMARY_COLOR:-}");
  });

  it("passes socket and public URL vars from tenant env (no per-tenant hardcoding)", () => {
    expect(composeText).toContain("PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-${BASE_URL}}");
    expect(composeText).toContain("PUBLIC_PROXY_PORT=${PUBLIC_PROXY_PORT}");
    expect(composeText).toContain("SOCKET_ALLOWED_ORIGINS=${SOCKET_ALLOWED_ORIGINS:-}");
  });
});
