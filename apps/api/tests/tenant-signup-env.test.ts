import { describe, expect, it } from "vitest";
import { apiConfig } from "@repo/config";
import { buildTenantSignupEnv } from "../../../infra/worker-service/domain/provisioning/tenant-env.js";

describe("buildTenantSignupEnv", () => {
  it("copies signup policy from repo root @repo/config", () => {
    expect(buildTenantSignupEnv()).toEqual({
      SIGNUP_DISABLED: apiConfig.signupDisabled ? "true" : "false",
      SIGNUP_ALLOWED_DOMAINS: apiConfig.signupAllowedDomains,
      SIGNUP_ALLOWED_EMAILS: apiConfig.signupAllowedEmailsOverride,
    });
  });
});
