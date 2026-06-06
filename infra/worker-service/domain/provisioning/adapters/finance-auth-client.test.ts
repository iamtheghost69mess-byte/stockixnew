import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatSigninError,
  signinToFinanceSession,
  signinWithRetry,
} from "./finance-auth-client.js";

describe("signinToFinanceSession", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("classifies 401 with no organization message", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("No organization found for this user", { status: 401 }),
    );
    const result = await signinToFinanceSession(
      "http://127.0.0.1:4100",
      "admin@test.com",
      "secret",
      "corr-1",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("signin_no_organization");
  });

  it("classifies generic 401 as invalid credentials", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Invalid credentials", { status: 401 }));
    const result = await signinToFinanceSession(
      "http://127.0.0.1:4100",
      "admin@test.com",
      "secret",
      "corr-1",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("signin_invalid_credentials");
  });

  it("parses snake_case success body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "tok-abc",
          organization_id: "org-123",
          tenant_id: 7,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await signinToFinanceSession(
      "http://127.0.0.1:4100",
      "admin@test.com",
      "secret",
      "corr-1",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accessToken).toBe("tok-abc");
    expect(result.organizationId).toBe("org-123");
    expect(result.tenantId).toBe(7);
  });

  it("returns signin_parse_failed when token missing on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await signinToFinanceSession(
      "http://127.0.0.1:4100",
      "admin@test.com",
      "secret",
      "corr-1",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("signin_parse_failed");
  });
});

describe("signinWithRetry", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries until sign-in succeeds", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("Invalid credentials", { status: 401 }))
      .mockResolvedValueOnce(new Response("Invalid credentials", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "tok", organization_id: "org-1" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const promise = signinWithRetry(
      "http://127.0.0.1:4100",
      "admin@test.com",
      "secret",
      "corr-1",
      { maxAttempts: 3, delayMs: 1000 },
    );
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("formatSigninError includes code and detail", () => {
    expect(
      formatSigninError({
        ok: false,
        code: "signin_http_503",
        detail: "service unavailable",
      }),
    ).toBe("signin_http_503: service unavailable");
  });
});
