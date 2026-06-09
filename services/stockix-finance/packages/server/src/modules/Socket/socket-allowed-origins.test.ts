import { afterEach, describe, expect, it } from "vitest";

import {
  isSocketOriginAllowed,
  resolveSocketAllowedOrigins,
} from "./socket-allowed-origins";

describe("resolveSocketAllowedOrigins", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("merges SOCKET_ALLOWED_ORIGINS with PUBLIC_BASE_URL and PUBLIC_PROXY_PORT", () => {
    process.env.SOCKET_ALLOWED_ORIGINS = "http://my-tenant.localhost";
    process.env.PUBLIC_BASE_URL = "http://my-tenant.localhost";
    process.env.PUBLIC_PROXY_PORT = "4300";

    const allowed = resolveSocketAllowedOrigins();

    expect(allowed).toContain("http://my-tenant.localhost");
    expect(allowed).toContain("http://127.0.0.1:4300");
    expect(allowed).toContain("http://localhost:4300");
    expect(allowed).not.toContain("dajo");
  });

  it("allows origin when host matches configured list", () => {
    const allowed = [
      "http://example-tenant.localhost",
      "http://127.0.0.1:4201",
    ];
    expect(
      isSocketOriginAllowed("http://127.0.0.1:4201", allowed),
    ).toBe(true);
    expect(
      isSocketOriginAllowed("http://wrong.localhost", allowed),
    ).toBe(false);
  });

  it("allows loopback on any port when PUBLIC_PROXY_PORT is set", () => {
    process.env.PUBLIC_PROXY_PORT = "4300";
    process.env.PUBLIC_BASE_URL = "http://my-tenant.localhost";

    expect(
      isSocketOriginAllowed("http://127.0.0.1:9999", []),
    ).toBe(true);
    expect(
      isSocketOriginAllowed("http://my-tenant.localhost:4300", []),
    ).toBe(true);
  });
});
