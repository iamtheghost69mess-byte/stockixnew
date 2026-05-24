import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("bootstrapPosOrganization", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.POS_PLATFORM_API_KEY = "pk_live_test_key_1234567890";
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
