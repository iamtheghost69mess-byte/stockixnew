import { describe, expect, it } from "vitest";
import { buildTenantSignupEnv } from "../../../infra/worker-service/domain/provisioning/tenant-env.js";

describe("buildTenantSignupEnv", () => {
  it("writes only SIGNUP_DISABLED=true for new tenants", () => {
    expect(buildTenantSignupEnv()).toEqual({ SIGNUP_DISABLED: "true" });
    expect(Object.keys(buildTenantSignupEnv())).not.toContain(
      "SIGNUP_ALLOWED_EMAILS",
    );
    expect(Object.keys(buildTenantSignupEnv())).not.toContain(
      "SIGNUP_ALLOWED_DOMAINS",
    );
  });
});
