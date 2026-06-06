import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { getRepoRoot } from "../domain/repo-root.js";
import {
  resolvePosJwtEnv,
  resolvePosResendApiKey,
  resolvePosTenantEnvPath,
} from "./module-stacks.js";

describe("resolvePosTenantEnvPath", () => {
  it("ends with slug/.env under tenant env root", () => {
    const path = resolvePosTenantEnvPath("acme-corp");
    expect(path.replace(/\\/g, "/")).toMatch(/acme-corp\/\.env$/);
  });
});

describe("resolvePosJwtEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-min-32-chars!!";
    process.env.LICENSE_SIGNING_SECRET = "test-license-signing-secret-min-32!!";
    process.env.PLATFORM_JWT_SECRET = "test-platform-jwt-secret-min-32-chars!";
    process.env.FIELD_ENCRYPTION_KEY = "dGVzdC1maWVsZC1lbmNyeXB0aW9uLWtleQ==";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns JWT, platform, license, and field encryption secrets", () => {
    const secrets = resolvePosJwtEnv();
    expect(secrets.JWT_SECRET).toBeTruthy();
    expect(secrets.PLATFORM_JWT_SECRET).toBe("test-platform-jwt-secret-min-32-chars!");
    expect(secrets.LICENSE_SIGNING_SECRET).toBeTruthy();
    expect(secrets.FIELD_ENCRYPTION_KEY).toBe("dGVzdC1maWVsZC1lbmNyeXB0aW9uLWtleQ==");
  });
});

describe("resolvePosResendApiKey", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("requires explicit RESEND_API_KEY", () => {
    delete process.env.RESEND_API_KEY;
    process.env.MAIL_PASSWORD = "smtp-password-should-not-be-used";
    expect(() => resolvePosResendApiKey()).toThrow(/RESEND_API_KEY is required/);
  });

  it("returns trimmed RESEND_API_KEY when set", () => {
    process.env.RESEND_API_KEY = " re_test_key ";
    expect(resolvePosResendApiKey()).toBe("re_test_key");
  });
});

describe("pos-tenant-stack docker-compose.yml", () => {
  const composeText = readFileSync(
    join(getRepoRoot(), "infra", "pos-tenant-stack", "docker-compose.yml"),
    "utf8",
  );

  it("declares POS JWT and license env vars on backend services", () => {
    expect(composeText).toContain("- JWT_SECRET=${JWT_SECRET}");
    expect(composeText).toContain("- PLATFORM_JWT_SECRET=${PLATFORM_JWT_SECRET}");
    expect(composeText).toContain("- LICENSE_SIGNING_SECRET=${LICENSE_SIGNING_SECRET}");
    expect(composeText).toContain("- FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY:-}");
  });
});
