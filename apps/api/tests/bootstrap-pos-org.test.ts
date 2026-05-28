import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("bootstrapPosOrganization", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.POS_PLATFORM_API_KEY = "pos-api-key-placeholder";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/health") || url.endsWith("/ready") || url.endsWith("/api/ping")) {
          return new Response("ok", { status: 200 });
        }
        if (url.includes("/organizations/health-summary")) {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (url.endsWith("/api/platform/v1/organizations") && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              success: true,
              bootstrapMode: "sync_fallback",
              fullCredentials: [
                { role: "admin", username: "admin", pin: "123456" },
                { role: "cashier", username: "cashier", pin: "654321" },
              ],
              data: {
                _id: "507f1f77bcf86cd799439011",
                defaultCredentials: [
                  { role: "admin", username: "admin", pinMasked: "••••••", pinLastTwo: "56" },
                  { role: "cashier", username: "cashier", pinMasked: "••••••", pinLastTwo: "21" },
                ],
              },
            }),
            { status: 201 },
          );
        }
        if (url.includes("/provisioning-credentials/consume") && init?.method === "POST") {
          return new Response(null, { status: 204 });
        }
        if (url.includes("/provisioning-status")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                lifecycle: "active",
                readyForPinLogin: true,
                fullCredentials: [
                  { role: "admin", username: "admin", pin: "123456" },
                  { role: "cashier", username: "cashier", pin: "654321" },
                ],
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/platform/v1/organizations/")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                _id: "507f1f77bcf86cd799439011",
                defaultCredentials: [
                  { role: "admin", username: "admin", pinMasked: "••••••", pinLastTwo: "56" },
                  { role: "cashier", username: "cashier", pinMasked: "••••••", pinLastTwo: "21" },
                ],
              },
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it("falls back to org defaultCredentials when provisioning-status omits fullCredentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/health") || url.endsWith("/ready") || url.endsWith("/api/ping")) {
          return new Response("ok", { status: 200 });
        }
        if (url.includes("/organizations/health-summary")) {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (url.endsWith("/api/platform/v1/organizations") && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              success: true,
              bootstrapMode: "queue",
              data: { _id: "507f1f77bcf86cd799439011" },
            }),
            { status: 201 },
          );
        }
        if (url.includes("/provisioning-credentials/consume") && init?.method === "POST") {
          return new Response(null, { status: 204 });
        }
        if (url.includes("/provisioning-status")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                lifecycle: "active",
                readyForPinLogin: true,
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/platform/v1/organizations/507f1f77bcf86cd799439011")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                _id: "507f1f77bcf86cd799439011",
                defaultCredentials: [
                  { role: "admin", username: "admin", pin: "842351" },
                  { role: "cashier", username: "cashier", pin: "490964" },
                ],
              },
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const { bootstrapPosOrganization } = await import(
      "../../../infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.js"
    );
    const result = await bootstrapPosOrganization({
      slug: "legacy-pos",
      tenantName: "Legacy POS",
      tenantId: "660e8400-e29b-41d4-a716-446655440002",
      adminEmail: "admin@legacy.test",
      log: () => {},
      posHostPort: 8010,
    });
    expect(result.posDefaultCredentials.adminPin).toBe("842351");
    expect(result.posDefaultCredentials.allRoles).toHaveLength(2);
  });

  it("captures fullCredentials after delayed provisioning-status polls", async () => {
    let statusPolls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/health") || url.endsWith("/ready") || url.endsWith("/api/ping")) {
          return new Response("ok", { status: 200 });
        }
        if (url.includes("/organizations/health-summary")) {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (url.endsWith("/api/platform/v1/organizations") && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              success: true,
              bootstrapMode: "queue",
              data: { _id: "507f1f77bcf86cd799439011" },
            }),
            { status: 201 },
          );
        }
        if (url.includes("/provisioning-credentials/consume") && init?.method === "POST") {
          return new Response(null, { status: 204 });
        }
        if (url.includes("/provisioning-status")) {
          statusPolls += 1;
          const ready = statusPolls >= 3;
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                lifecycle: "active",
                readyForPinLogin: ready,
                ...(ready
                  ? {
                      fullCredentials: [
                        { role: "admin", username: "admin", pin: "111222" },
                        { role: "cashier", username: "cashier", pin: "333444" },
                      ],
                    }
                  : {}),
              },
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const { bootstrapPosOrganization } = await import(
      "../../../infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.js"
    );
    const result = await bootstrapPosOrganization({
      slug: "delayed-pos",
      tenantName: "Delayed POS",
      tenantId: "660e8400-e29b-41d4-a716-446655440003",
      adminEmail: "admin@delayed.test",
      log: () => {},
      posHostPort: 8010,
    });
    expect(statusPolls).toBeGreaterThanOrEqual(3);
    expect(result.posDefaultCredentials.adminPin).toBe("111222");
    expect(result.posDefaultCredentials.allRoles).toHaveLength(2);
  });

  it("timeout error includes orgId when bootstrap never becomes ready", async () => {
    process.env.BOOTSTRAP_POLL_TIMEOUT_MS = "300";
    process.env.BOOTSTRAP_POLL_INTERVAL_MS = "50";
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/health") || url.endsWith("/ready") || url.endsWith("/api/ping")) {
          return new Response("ok", { status: 200 });
        }
        if (url.includes("/organizations/health-summary")) {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (url.endsWith("/api/platform/v1/organizations") && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              success: true,
              bootstrapMode: "queue",
              data: { _id: "507f1f77bcf86cd799439099" },
            }),
            { status: 201 },
          );
        }
        if (url.includes("/provisioning-status")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: { lifecycle: "active", readyForPinLogin: false },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/platform/v1/organizations/507f1f77bcf86cd799439099")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                _id: "507f1f77bcf86cd799439099",
                defaultCredentials: [
                  { role: "admin", username: "admin", pinMasked: "••••••" },
                ],
              },
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const { bootstrapPosOrganization } = await import(
      "../../../infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.js"
    );
    await expect(
      bootstrapPosOrganization({
        slug: "timeout-pos",
        tenantName: "Timeout POS",
        tenantId: "660e8400-e29b-41d4-a716-446655440099",
        adminEmail: "admin@timeout.test",
        log: () => {},
        posHostPort: 8010,
      }),
    ).rejects.toThrow(/orgId=507f1f77bcf86cd799439099/);
    delete process.env.BOOTSTRAP_POLL_TIMEOUT_MS;
    delete process.env.BOOTSTRAP_POLL_INTERVAL_MS;
    vi.resetModules();
  });

  it("creates org and returns PIN credentials", async () => {
    const { bootstrapPosOrganization } = await import(
      "../../../infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.js"
    );
    const logs: string[] = [];
    const result = await bootstrapPosOrganization({
      slug: "acme-pos",
      tenantName: "Acme POS",
      tenantId: "660e8400-e29b-41d4-a716-446655440001",
      adminEmail: "admin@acme.test",
      log: (m) => logs.push(m),
      posHostPort: 8010,
    });
    expect(result.posOrganizationId).toBe("507f1f77bcf86cd799439011");
    expect(result.posDefaultCredentials.adminPin).toBe("123456");
    expect(result.posDefaultCredentials.allRoles).toHaveLength(2);
  });
});
