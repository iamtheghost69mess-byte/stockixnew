import { describe, expect, it, vi } from "vitest";
import { assertChatwootEnvConfigured } from "./chatwoot-provision.js";

describe("Chatwoot Provisioning", () => {
  it("throws ConfigurationError when Chatwoot environment variables are missing", () => {
    const originalEnv = { ...process.env };
    
    delete process.env.CHATWOOT_API_URL;
    delete process.env.CHATWOOT_SUPER_ADMIN_EMAIL;
    delete process.env.CHATWOOT_SUPER_ADMIN_PASSWORD;

    expect(() => assertChatwootEnvConfigured()).toThrow(/Chatwoot API URL is not configured/);

    process.env.CHATWOOT_API_URL = "http://chatwoot:3000";
    expect(() => assertChatwootEnvConfigured()).toThrow(/Chatwoot super admin email is not configured/);

    process.env.CHATWOOT_SUPER_ADMIN_EMAIL = "admin@example.com";
    expect(() => assertChatwootEnvConfigured()).toThrow(/Chatwoot super admin password is not configured/);

    process.env.CHATWOOT_SUPER_ADMIN_PASSWORD = "password";
    expect(() => assertChatwootEnvConfigured()).not.toThrow();

    process.env = originalEnv;
  });
});
