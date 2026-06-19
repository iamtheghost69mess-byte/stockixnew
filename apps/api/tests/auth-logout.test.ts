/**
 * Auth logout handler tests — verifies that logout bumps sessionVersion
 * in the database and evicts the session from the in-process cache.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks (hoisted by vitest) ─────────────────────────────────────────
// All mocks must be declared before any dynamic imports that would trigger them.

vi.mock("../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logLine: vi.fn(),
}));

vi.mock("../src/lib/redis.js", () => ({
  getControlPlaneRedisClient: () => null,
}));

const invalidateCacheMock = vi.fn();
vi.mock("../src/middleware/auth.js", () => ({
  invalidateSessionCache: invalidateCacheMock,
}));

const verifySessionTokenMock = vi.fn<[string], Promise<{ sub: string; role: string; sessionVersion: number } | null>>();
vi.mock("../src/services/auth/tokens.js", () => ({
  verifySessionToken: verifySessionTokenMock,
  signSessionToken: vi.fn().mockResolvedValue("signed-token"),
  signMfaToken: vi.fn().mockResolvedValue("mfa-token"),
  verifyMfaToken: vi.fn().mockResolvedValue(null),
}));

vi.mock("../src/services/auth/session-validation.js", () => ({
  validateOwnerSession: vi.fn().mockResolvedValue({ success: true, data: {} }),
}));

vi.mock("../src/services/auth/password-reset.js", () => ({
  completeOwnerPasswordReset: vi.fn(),
  requestOwnerPasswordReset: vi.fn(),
}));

vi.mock("../src/services/auth/login.js", () => ({
  loginOwner: vi.fn(),
  reconfirmOwnerPassword: vi.fn(),
}));

vi.mock("../src/services/mfa/mfa.js", () => ({
  beginMfaSetup: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
  getMfaStatus: vi.fn(),
  verifyMfaCode: vi.fn(),
}));

vi.mock("../src/services/invites/invites.js", () => ({
  acceptInvite: vi.fn(),
  getInviteByToken: vi.fn(),
}));

vi.mock("../src/permissions/resolve-owner-permissions.js", () => ({
  validateAndResolveOwnerAuth: vi.fn(),
  loadOwnerAuthById: vi.fn(),
}));

vi.mock("@repo/config", () => ({
  apiConfig: {
    nodeEnv: "test",
    publicBaseUrlScheme: "http",
    dashboardUrl: "http://dashboard.test",
  },
  isMailConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock("@repo/shared/permissions", () => ({
  capabilitiesFromPermissions: vi.fn().mockReturnValue({}),
  hasAllPermissions: vi.fn().mockReturnValue(true),
}));

vi.mock("@repo/db/schema", () => ({
  owners: { id: "owners_id_col", sessionVersion: "owners_sv_col" },
  adminAuditLog: {},
  ownerOrganizationAccess: {},
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type SetResult = { set: unknown; where: unknown; catch: unknown };
type UpdateResult = { set: (vals: unknown) => SetResult };

function makeFakeDb(): { update: (table: unknown) => UpdateResult } & Record<string, unknown> {
  const fakeWhere = { catch: vi.fn().mockResolvedValue(undefined) };
  const fakeSet: SetResult = {
    set: vi.fn().mockReturnValue(fakeWhere),
    where: vi.fn().mockReturnValue(fakeWhere),
    catch: vi.fn().mockResolvedValue(undefined),
  };
  const fakeUpdate: UpdateResult = { set: vi.fn().mockReturnValue(fakeSet) };
  return { update: vi.fn().mockReturnValue(fakeUpdate), _fakeSet: fakeSet, _fakeUpdate: fakeUpdate };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Logout handler — sessionVersion invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bumps sessionVersion when a valid session cookie is present", async () => {
    verifySessionTokenMock.mockResolvedValueOnce({ sub: "owner-42", role: "super_admin", sessionVersion: 3 });
    const { buildAuthRoutes } = await import("../src/routes/auth/index.js");
    const fakeDb = makeFakeDb();

    const app = buildAuthRoutes(fakeDb as never);
    const res = await app.request("/logout", {
      method: "POST",
      headers: {
        cookie: `stockix-session=${encodeURIComponent("valid-token")}`,
        origin: "http://dashboard.test",
      },
    });

    expect(res.status).toBe(200);
    expect(fakeDb.update).toHaveBeenCalledOnce();
    expect(invalidateCacheMock).toHaveBeenCalledOnce();
    expect(invalidateCacheMock).toHaveBeenCalledWith("valid-token");
  });

  it("returns 200 and clears cookies even when no session token is present", async () => {
    const { buildAuthRoutes } = await import("../src/routes/auth/index.js");
    const fakeDb = makeFakeDb();

    const app = buildAuthRoutes(fakeDb as never);
    const res = await app.request("/logout", {
      method: "POST",
      headers: { origin: "http://dashboard.test" },
    });

    expect(res.status).toBe(200);
    expect(fakeDb.update).not.toHaveBeenCalled();
    expect(invalidateCacheMock).not.toHaveBeenCalled();
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  it("does not bump sessionVersion when token fails verification", async () => {
    verifySessionTokenMock.mockRejectedValueOnce(new Error("bad token"));
    const { buildAuthRoutes } = await import("../src/routes/auth/index.js");
    const fakeDb = makeFakeDb();

    const app = buildAuthRoutes(fakeDb as never);
    const res = await app.request("/logout", {
      method: "POST",
      headers: {
        cookie: `stockix-session=${encodeURIComponent("bad-token")}`,
        origin: "http://dashboard.test",
      },
    });

    expect(res.status).toBe(200);
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("returns 403 on CSRF violation (mismatched origin)", async () => {
    const { buildAuthRoutes } = await import("../src/routes/auth/index.js");
    const fakeDb = makeFakeDb();

    const app = buildAuthRoutes(fakeDb as never);
    const res = await app.request("/logout", {
      method: "POST",
      headers: { origin: "http://evil.example.com" },
    });

    expect(res.status).toBe(403);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("csrf_violation");
  });

  it("sets expired cookie headers on successful logout", async () => {
    verifySessionTokenMock.mockResolvedValueOnce({ sub: "owner-1", role: "super_admin", sessionVersion: 1 });
    const { buildAuthRoutes } = await import("../src/routes/auth/index.js");
    const fakeDb = makeFakeDb();

    const app = buildAuthRoutes(fakeDb as never);
    const res = await app.request("/logout", {
      method: "POST",
      headers: {
        cookie: `stockix-session=${encodeURIComponent("tok")}`,
        origin: "http://dashboard.test",
      },
    });

    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("stockix-session=") && c.includes("Max-Age=0"))).toBe(true);
    expect(setCookies.some((c) => c.startsWith("stockix-mfa=") && c.includes("Max-Age=0"))).toBe(true);
  });
});
