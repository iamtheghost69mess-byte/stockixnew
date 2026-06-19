import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const assertTenantModuleLicensedMock = vi.fn();
const respondModuleAccessDeniedMock = vi.fn();
const assertTenantInOwnerScopeMock = vi.fn();
const pmsProxyJsonMock = vi.fn();

vi.mock("../src/lib/tenant-module-access.js", () => ({
  assertTenantModuleLicensed: assertTenantModuleLicensedMock,
  respondModuleAccessDenied: respondModuleAccessDeniedMock,
}));

vi.mock("../src/org-access-scope.js", () => ({
  assertTenantInOwnerScope: assertTenantInOwnerScopeMock,
}));

vi.mock("../src/pms-proxy.js", () => ({
  pmsProxyJson: pmsProxyJsonMock,
}));

vi.mock("@repo/config", () => ({
  apiConfig: { platformApiSecret: "test-secret" },
  env: {},
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_TENANT_ID = "00000000-0000-0000-0000-000000000002";
const ACTOR_ID = "aaaa0000-0000-0000-0000-000000000000";

type MockDb = Record<string, never>;

function buildApp(db: MockDb | null = {} as MockDb) {
  const app = new Hono();

  // Simulate what the real auth middleware sets on the context
  app.use("*", async (c, next) => {
    c.set("actorId" as never, ACTOR_ID);
    c.set("actorRole" as never, "super_admin");
    c.set("actorPermissions" as never, []);
    c.set("requestId" as never, "test-req-id");
    await next();
  });

  return import("../src/routes/pms-proxy-http.js").then(({ registerPmsProxyRoutes }) => {
    registerPmsProxyRoutes(app as never, db as never);
    return app;
  });
}

function makeRequest(tenantId?: string, path = "/pms/api/properties") {
  const url = tenantId
    ? `http://local${path}?tenantId=${tenantId}`
    : `http://local${path}`;
  return { method: "GET", headers: {} };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PMS proxy — tenant scope enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertTenantModuleLicensedMock.mockResolvedValue({ ok: true });
    assertTenantInOwnerScopeMock.mockResolvedValue(true);
    pmsProxyJsonMock.mockResolvedValue({ data: { ok: true }, status: 200 });
  });

  it("returns 400 when tenantId query param is missing", async () => {
    const app = await buildApp();
    const res = await app.request("http://local/pms/api/properties", { method: "GET" });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("bad_request");
  });

  it("returns 400 when tenantId is not a valid UUID", async () => {
    const app = await buildApp();
    const res = await app.request("http://local/pms/api/properties?tenantId=not-a-uuid", { method: "GET" });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("bad_request");
  });

  it("returns 403 when actor is not in scope for the tenant", async () => {
    assertTenantInOwnerScopeMock.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.request(`http://local/pms/api/properties?tenantId=${OTHER_TENANT_ID}`, { method: "GET" });
    expect(res.status).toBe(403);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("forbidden");
  });

  it("calls assertTenantInOwnerScope with the correct actor and tenantId", async () => {
    const app = await buildApp();
    await app.request(`http://local/pms/api/properties?tenantId=${VALID_TENANT_ID}`, { method: "GET" });
    expect(assertTenantInOwnerScopeMock).toHaveBeenCalledWith(
      expect.anything(), // db
      ACTOR_ID,
      VALID_TENANT_ID,
      [],
      "super_admin",
    );
  });

  it("proxies the request when actor is in scope", async () => {
    const app = await buildApp();
    const res = await app.request(`http://local/pms/api/properties?tenantId=${VALID_TENANT_ID}`, { method: "GET" });
    expect(res.status).toBe(200);
    expect(pmsProxyJsonMock).toHaveBeenCalledOnce();
  });

  it("sends x-stockix-tenant-id header with validated tenantId (not raw query)", async () => {
    const app = await buildApp();
    await app.request(`http://local/pms/api/properties?tenantId=${VALID_TENANT_ID}`, { method: "GET" });
    const callArgs = pmsProxyJsonMock.mock.calls[0] as [string, string, { headers: Record<string, string>; requestId?: string }];
    expect(callArgs[2].headers["x-stockix-tenant-id"]).toBe(VALID_TENANT_ID);
    expect(callArgs[2].headers["x-stockix-internal-secret"]).toBe("test-secret");
  });

  it("forwards x-request-id to the PMS service", async () => {
    const app = await buildApp();
    await app.request(`http://local/pms/api/properties?tenantId=${VALID_TENANT_ID}`, { method: "GET" });
    const callArgs = pmsProxyJsonMock.mock.calls[0] as [string, string, { requestId?: string }];
    expect(callArgs[2].requestId).toBe("test-req-id");
  });

  it("skips scope check when db is null (no-db mode)", async () => {
    const app = await buildApp(null);
    const res = await app.request(`http://local/pms/api/properties?tenantId=${VALID_TENANT_ID}`, { method: "GET" });
    expect(assertTenantInOwnerScopeMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("module license denial blocks the request before scope check", async () => {
    assertTenantModuleLicensedMock.mockResolvedValue({ ok: false, reason: "not_licensed" });
    respondModuleAccessDeniedMock.mockReturnValue(new Response(JSON.stringify({ error: "module_not_licensed" }), { status: 403 }));
    const app = await buildApp();
    const res = await app.request(`http://local/pms/api/properties?tenantId=${VALID_TENANT_ID}`, { method: "GET" });
    expect(res.status).toBe(403);
    expect(assertTenantInOwnerScopeMock).not.toHaveBeenCalled();
  });
});
