import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listUsersMock = vi.fn();
const createUserMock = vi.fn();
const inviteUserMock = vi.fn();

vi.mock("@repo/config", () => ({
  apiConfig: {
    tenantInternalHost: "127.0.0.1",
    internalApiSecret: "test-internal-secret",
  },
}));

vi.mock("../src/finance-users.client.js", () => ({
  createFinanceUsersClient: () => ({
    listUsers: listUsersMock,
    createUser: createUserMock,
    inviteUser: inviteUserMock,
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    resetPassword: vi.fn(),
    suspendUser: vi.fn(),
    activateUser: vi.fn(),
  }),
}));

const resolveAndPersistMock = vi.fn();

vi.mock("../src/finance-tenant-resolve.js", () => ({
  resolveAndPersistFinanceTenantId: (...args: unknown[]) => resolveAndPersistMock(...args),
}));

const TENANT_UUID = "11111111-1111-4111-8111-111111111111";

function mockDbRow(overrides?: { financeTenantId?: number | null; internalPort?: number | null }) {
  const financeTenantId =
    overrides && "financeTenantId" in overrides ? overrides.financeTenantId : 42;
  const internalPort =
    overrides && "internalPort" in overrides ? overrides.internalPort : 13001;
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                tenantId: TENANT_UUID,
                financeTenantId,
                internalPort,
                deploymentStatus: "active",
              },
            ]),
          }),
        }),
      }),
    }),
  };
}

describe("finance-users-http", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    resolveAndPersistMock.mockResolvedValue({ ok: false, error: "finance_resolve_failed" });
    const { registerTenantFinanceUsersApi } = await import("../src/finance-users-http.js");
    app = new Hono();
    app.use("*", async (c, next) => {
      c.set("actorId", "owner-1");
      c.set("actorRole", "super_admin");
      await next();
    });
    registerTenantFinanceUsersApi(app, mockDbRow() as never);
  });

  it("returns 400 for invalid tenant UUID", async () => {
    const res = await app.request("http://local/tenants/not-a-uuid/users");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "tenantId must be a UUID" });
  });

  it("returns 503 when finance tenant is not linked", async () => {
    const { registerTenantFinanceUsersApi } = await import("../src/finance-users-http.js");
    const localApp = new Hono();
    registerTenantFinanceUsersApi(localApp, mockDbRow({ financeTenantId: null }) as never);

    const res = await localApp.request(`http://local/tenants/${TENANT_UUID}/users`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("finance_tenant_not_linked");
    expect(resolveAndPersistMock).toHaveBeenCalledWith(expect.anything(), TENANT_UUID);
  });

  it("auto-repairs finance tenant id before listing users", async () => {
    resolveAndPersistMock.mockResolvedValueOnce({
      ok: true,
      financeTenantId: 99,
      source: "finance_api",
    });
    listUsersMock.mockResolvedValue({ users: [] });

    const { registerTenantFinanceUsersApi } = await import("../src/finance-users-http.js");
    const localApp = new Hono();
    registerTenantFinanceUsersApi(localApp, mockDbRow({ financeTenantId: null }) as never);

    const res = await localApp.request(`http://local/tenants/${TENANT_UUID}/users`);
    expect(res.status).toBe(200);
    expect(listUsersMock).toHaveBeenCalledWith(99);
  });

  it("repair-finance-link persists resolved tenant id", async () => {
    resolveAndPersistMock.mockResolvedValueOnce({
      ok: true,
      financeTenantId: 77,
      organizationId: "org-abc",
      source: "finance_api",
    });

    const res = await app.request(
      `http://local/tenants/${TENANT_UUID}/repair-finance-link`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ financeTenantId: 77, source: "finance_api" });
  });

  it("lists users via finance client", async () => {
    listUsersMock.mockResolvedValue({
      users: [
        {
          userId: 1,
          email: "u@example.com",
          firstName: "A",
          lastName: "B",
          roleName: "Admin",
          isActive: true,
        },
      ],
    });

    const res = await app.request(`http://local/tenants/${TENANT_UUID}/users`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(listUsersMock).toHaveBeenCalledWith(42);
  });

  it("creates user with validated body", async () => {
    createUserMock.mockResolvedValue({
      userId: 99,
      email: "new@example.com",
      tenantId: 42,
      created: true,
    });

    const res = await app.request(`http://local/tenants/${TENANT_UUID}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "new@example.com",
        firstName: "New",
        lastName: "User",
        password: "password123",
        roleId: 1,
      }),
    });

    expect(res.status).toBe(201);
    expect(createUserMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ email: "new@example.com", roleId: 1 }),
    );
  });

  it("invites user via finance client", async () => {
    inviteUserMock.mockResolvedValue({
      userId: 5,
      email: "invite@example.com",
      message: "Invitation queued for delivery",
    });

    const res = await app.request(
      `http://local/tenants/${TENANT_UUID}/users/invite`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "invite@example.com", roleId: 2 }),
      },
    );

    expect(res.status).toBe(201);
    expect(inviteUserMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ email: "invite@example.com", roleId: 2 }),
    );
  });

  it("returns 503 on invite when finance tenant is not linked", async () => {
    const { registerTenantFinanceUsersApi } = await import("../src/finance-users-http.js");
    const localApp = new Hono();
    registerTenantFinanceUsersApi(localApp, mockDbRow({ financeTenantId: null }) as never);

    const res = await localApp.request(
      `http://local/tenants/${TENANT_UUID}/users/invite`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "invite@example.com", roleId: 1 }),
      },
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("finance_tenant_not_linked");
  });

  it("returns 400 for invalid create body", async () => {
    const res = await app.request(`http://local/tenants/${TENANT_UUID}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-email" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_body");
  });
});
