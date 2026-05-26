import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { registerPosCredentialsRoutes } from "../src/pos-credentials-http.js";

const posProxyJson = vi.fn();

vi.mock("../src/pos-proxy.js", () => ({
  posProxyJson: (...args: unknown[]) => posProxyJson(...args),
}));

vi.mock("../src/audit.js", () => ({
  logAudit: vi.fn(async () => undefined),
}));

describe("pos-credentials routes", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const posOrgId = "aaaaaaaaaaaaaaaaaaaaaaaa";

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                id: tenantId,
                slug: "demo",
                posOrganizationId: posOrgId,
              },
            ]),
          })),
        })),
      })),
    })),
  };

  beforeEach(() => {
    posProxyJson.mockReset();
    vi.stubEnv("INTERNAL_API_SECRET", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function buildApp(actorRole = "super_admin") {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("actorId", "owner-1");
      c.set("actorRole", actorRole);
      await next();
    });
    registerPosCredentialsRoutes(app as never, db as never);
    return app;
  }

  it("returns full PIN roles from POS platform", async () => {
    posProxyJson.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          roles: [
            { role: "admin", username: "admin", pin: "123456" },
            { role: "cashier", username: "cashier", pin: "654321" },
          ],
        },
      },
    });

    const app = buildApp();
    const res = await app.request(`http://local/tenants/${tenantId}/pos-credentials`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { roles: { role: string; pin: string }[] };
    expect(body.roles).toHaveLength(2);
    expect(body.roles[0]?.pin).toBe("123456");
    expect(body.roles[0]?.masked).toBe(false);
    expect(posProxyJson).toHaveBeenCalledWith(
      `/organizations/${encodeURIComponent(posOrgId)}/credentials`,
      "GET",
    );
  });

  it("returns masked true when POS returns pinMasked only", async () => {
    posProxyJson.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          roles: [
            {
              role: "admin",
              username: "admin",
              pinMasked: "••••56",
              pinLastTwo: "56",
            },
          ],
        },
      },
    });

    const app = buildApp();
    const res = await app.request(`http://local/tenants/${tenantId}/pos-credentials`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      roles: { role: string; pin: string; masked: boolean }[];
    };
    expect(body.roles[0]?.masked).toBe(true);
    expect(body.roles[0]?.pin).toContain("•");
  });

  it("forbids read_only from revealing PINs", async () => {
    const app = buildApp("read_only");
    const res = await app.request(`http://local/tenants/${tenantId}/pos-credentials`);
    expect(res.status).toBe(403);
  });

  it("proxies PIN reset to POS platform", async () => {
    posProxyJson.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          role: "cashier",
          pin: "999888",
          defaultCredentials: [{ role: "cashier", username: "cashier", pin: "999888" }],
        },
      },
    });

    const app = buildApp("support_agent");
    const res = await app.request(`http://local/tenants/${tenantId}/pos-credentials/reset-pin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "cashier" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pin: string; role: string };
    expect(body.role).toBe("cashier");
    expect(body.pin).toBe("999888");
  });

  it("returns masked false on roles after PIN reset when plaintext returned", async () => {
    posProxyJson
      .mockResolvedValueOnce({
        status: 200,
        data: {
          success: true,
          data: { role: "cashier", pin: "888777" },
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          success: true,
          data: {
            roles: [{ role: "cashier", username: "cashier", pin: "888777" }],
          },
        },
      });

    const app = buildApp("support_agent");
    const resetRes = await app.request(
      `http://local/tenants/${tenantId}/pos-credentials/reset-pin`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "cashier" }),
      },
    );
    expect(resetRes.status).toBe(200);

    const listRes = await app.request(`http://local/tenants/${tenantId}/pos-credentials`);
    const body = (await listRes.json()) as {
      roles: { role: string; masked: boolean; pin: string }[];
    };
    const cashier = body.roles.find((r) => r.role === "cashier");
    expect(cashier?.masked).toBe(false);
    expect(cashier?.pin).toBe("888777");
  });
});
