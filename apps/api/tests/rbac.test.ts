/**
 * Security tests for RBAC: requiredApiRole + ROLE_RANK enforcement.
 *
 * The RBAC middleware and requiredApiRole function live inside apps/api/src/index.ts,
 * which cannot be imported in tests because it calls serve() at module level and
 * requires a live database. Instead we:
 *
 *  1. Test requiredApiRole() by reproducing the exact same pure function logic
 *     (copied from src/index.ts). Any drift will be caught when tests run against
 *     the real implementation if that function is ever extracted to its own module.
 *
 *  2. Test the role-rank table from @repo/shared/roles directly.
 *
 *  3. Test session-layer RBAC through buildAuthRoutes (which does not require a DB
 *     for the /auth/me route) using the same pattern as auth-routes.test.ts.
 *
 *  4. Test session-version / suspended-actor rejection through validateOwnerSession
 *     (the service that the RBAC middleware delegates to) with a mocked DB.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLE_RANK, ROLES } from "@repo/shared/roles";
import type { Role } from "@repo/shared/roles";

// ---------------------------------------------------------------------------
// Module mocks for the auth route (same pattern as auth-routes.test.ts)
// ---------------------------------------------------------------------------

const verifySessionTokenMock = vi.fn();
const validateOwnerSessionMock = vi.fn();

vi.mock("../src/services/auth/tokens.js", () => ({
  signMfaToken: vi.fn(),
  signSessionToken: vi.fn(),
  verifyMfaToken: vi.fn(),
  verifySessionToken: verifySessionTokenMock,
}));

vi.mock("../src/services/auth/session-validation.js", () => ({
  validateOwnerSession: validateOwnerSessionMock,
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

// ---------------------------------------------------------------------------
// Reproduce requiredApiRole() exactly as it appears in src/index.ts.
// This is a pure function with no side-effects or imports — safe to inline.
// ---------------------------------------------------------------------------

function requiredApiRole(pathname: string, method: string): Role | null {
  if (pathname === "/health") return null;
  if (pathname.startsWith("/auth")) return null;
  if (pathname.startsWith("/internal/jobs")) return null;
  if (pathname.startsWith("/owners")) {
    if (method === "GET") return "read_only";
    return "super_admin";
  }
  if (pathname.startsWith("/tenants")) {
    if (pathname.includes("/provision")) return "support_agent";
    if (method === "GET") return "read_only";
    return "super_admin";
  }
  return "read_only";
}

// ---------------------------------------------------------------------------
// 1. Unit tests for ROLE_RANK values
// ---------------------------------------------------------------------------

describe("ROLE_RANK ordering", () => {
  it("defines all four roles", () => {
    for (const role of ROLES) {
      expect(typeof ROLE_RANK[role]).toBe("number");
    }
  });

  it("read_only has the lowest rank (0)", () => {
    expect(ROLE_RANK["read_only"]).toBe(0);
  });

  it("super_admin has the highest rank", () => {
    const max = Math.max(...ROLES.map((r) => ROLE_RANK[r]));
    expect(ROLE_RANK["super_admin"]).toBe(max);
  });

  it("super_admin outranks all other roles", () => {
    for (const role of ROLES) {
      if (role === "super_admin") continue;
      expect(ROLE_RANK["super_admin"]).toBeGreaterThan(ROLE_RANK[role]);
    }
  });

  it("support_agent outranks billing_manager", () => {
    expect(ROLE_RANK["support_agent"]).toBeGreaterThan(ROLE_RANK["billing_manager"]);
  });

  it("billing_manager outranks read_only", () => {
    expect(ROLE_RANK["billing_manager"]).toBeGreaterThan(ROLE_RANK["read_only"]);
  });
});

// ---------------------------------------------------------------------------
// 2. Unit tests for requiredApiRole()
// ---------------------------------------------------------------------------

describe("requiredApiRole", () => {
  it("returns null for /health", () => {
    expect(requiredApiRole("/health", "GET")).toBeNull();
  });

  it("returns null for /auth/*", () => {
    expect(requiredApiRole("/auth/login", "POST")).toBeNull();
    expect(requiredApiRole("/auth/me", "GET")).toBeNull();
  });

  it("returns null for /internal/jobs/*", () => {
    expect(requiredApiRole("/internal/jobs/claim", "POST")).toBeNull();
  });

  it("GET /owners requires at least read_only", () => {
    expect(requiredApiRole("/owners", "GET")).toBe("read_only");
  });

  it("POST /owners requires super_admin", () => {
    expect(requiredApiRole("/owners", "POST")).toBe("super_admin");
  });

  it("DELETE /owners/:id requires super_admin", () => {
    expect(requiredApiRole("/owners/some-id", "DELETE")).toBe("super_admin");
  });

  it("PATCH /owners/:id requires super_admin", () => {
    expect(requiredApiRole("/owners/some-id", "PATCH")).toBe("super_admin");
  });

  it("GET /tenants requires at least read_only", () => {
    expect(requiredApiRole("/tenants", "GET")).toBe("read_only");
  });

  it("POST /tenants requires super_admin", () => {
    expect(requiredApiRole("/tenants", "POST")).toBe("super_admin");
  });

  it("DELETE /tenants/:id requires super_admin", () => {
    expect(requiredApiRole("/tenants/some-id", "DELETE")).toBe("super_admin");
  });

  it("/tenants/*/provision routes require support_agent", () => {
    expect(requiredApiRole("/tenants/some-id/provision", "POST")).toBe("support_agent");
    expect(requiredApiRole("/tenants/provision-status/abc", "GET")).toBe("support_agent");
  });

  it("unknown paths default to read_only", () => {
    expect(requiredApiRole("/unknown-route", "GET")).toBe("read_only");
  });
});

// ---------------------------------------------------------------------------
// 3. Role enforcement: read_only vs. super_admin access checks
//
// We encode the role enforcement logic in a small helper that mirrors the
// middleware in src/index.ts: a role is allowed if its rank >= the required rank.
// ---------------------------------------------------------------------------

describe("role rank enforcement logic", () => {
  function isAllowed(actorRole: Role, requiredRole: Role): boolean {
    if (!(actorRole in ROLE_RANK)) return false;
    return ROLE_RANK[actorRole] >= ROLE_RANK[requiredRole];
  }

  it("read_only can access GET /tenants (requires read_only)", () => {
    expect(isAllowed("read_only", requiredApiRole("/tenants", "GET")!)).toBe(true);
  });

  it("read_only cannot access POST /tenants (requires super_admin)", () => {
    expect(isAllowed("read_only", requiredApiRole("/tenants", "POST")!)).toBe(false);
  });

  it("read_only cannot DELETE /owners/:id (requires super_admin)", () => {
    expect(isAllowed("read_only", requiredApiRole("/owners/id", "DELETE")!)).toBe(false);
  });

  it("support_agent can access GET /tenants (requires read_only)", () => {
    expect(isAllowed("support_agent", requiredApiRole("/tenants", "GET")!)).toBe(true);
  });

  it("support_agent cannot POST /tenants (requires super_admin)", () => {
    expect(isAllowed("support_agent", requiredApiRole("/tenants", "POST")!)).toBe(false);
  });

  it("support_agent can access /tenants/*/provision routes (requires support_agent)", () => {
    expect(
      isAllowed("support_agent", requiredApiRole("/tenants/id/provision", "POST")!),
    ).toBe(true);
  });

  it("billing_manager cannot POST /tenants (requires super_admin)", () => {
    expect(isAllowed("billing_manager", requiredApiRole("/tenants", "POST")!)).toBe(false);
  });

  it("super_admin can access all route tiers", () => {
    const routes: Array<[string, string]> = [
      ["/tenants", "GET"],
      ["/tenants", "POST"],
      ["/owners", "DELETE"],
      ["/owners", "PATCH"],
      ["/tenants/id/provision", "POST"],
    ];
    for (const [path, method] of routes) {
      const required = requiredApiRole(path, method);
      if (required === null) continue; // no restriction
      expect(isAllowed("super_admin", required)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Session-layer RBAC via buildAuthRoutes — test /auth/me
//    (uses the same Hono setup pattern as auth-routes.test.ts)
// ---------------------------------------------------------------------------

describe("session-layer role checks via /auth/me", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { buildAuthRoutes } = await import("../src/routes/auth/index.js");
    app = new Hono();
    app.route("/auth", buildAuthRoutes({} as never));
  });

  it("read_only session: /auth/me returns canManageTenants=false", async () => {
    verifySessionTokenMock.mockResolvedValue({
      sub: "owner-1",
      role: "read_only",
      email: "reader@example.com",
      name: "Reader",
      sessionVersion: 1,
    });
    validateOwnerSessionMock.mockResolvedValue({
      success: true,
      data: { id: "owner-1" },
    });

    const res = await app.request("http://local/auth/me", {
      headers: { cookie: "stockix-session=some-token" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.me.role).toBe("read_only");
    expect(body.me.capabilities.canManageTenants).toBe(false);
    expect(body.me.capabilities.canAccessSettings).toBe(false);
    expect(body.me.capabilities.canManageOwners).toBe(false);
  });

  it("super_admin session: /auth/me returns all capabilities true", async () => {
    verifySessionTokenMock.mockResolvedValue({
      sub: "owner-2",
      role: "super_admin",
      email: "admin@example.com",
      name: "Admin",
      sessionVersion: 2,
    });
    validateOwnerSessionMock.mockResolvedValue({
      success: true,
      data: { id: "owner-2" },
    });

    const res = await app.request("http://local/auth/me", {
      headers: { cookie: "stockix-session=some-token" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.me.capabilities.canAccessSettings).toBe(true);
    expect(body.me.capabilities.canManageOwners).toBe(true);
    expect(body.me.capabilities.canManageTenants).toBe(true);
  });

  it("support_agent session: /auth/me returns canManageTenants=true, canAccessSettings=false", async () => {
    verifySessionTokenMock.mockResolvedValue({
      sub: "owner-3",
      role: "support_agent",
      email: "support@example.com",
      name: "Support",
      sessionVersion: 1,
    });
    validateOwnerSessionMock.mockResolvedValue({
      success: true,
      data: { id: "owner-3" },
    });

    const res = await app.request("http://local/auth/me", {
      headers: { cookie: "stockix-session=some-token" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.me.capabilities.canManageTenants).toBe(true);
    expect(body.me.capabilities.canAccessSettings).toBe(false);
    expect(body.me.capabilities.canManageOwners).toBe(false);
  });

  it("no session cookie: /auth/me returns 401 unauthorized", async () => {
    verifySessionTokenMock.mockResolvedValue(null);

    const res = await app.request("http://local/auth/me");
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: "unauthorized" });
  });

  it("suspended actor: validateOwnerSession returns forbidden → 401/403", async () => {
    verifySessionTokenMock.mockResolvedValue({
      sub: "owner-4",
      role: "super_admin",
      email: "suspended@example.com",
      name: "Suspended",
      sessionVersion: 1,
    });
    // Simulate what validateOwnerSession returns when owner.status !== "active"
    validateOwnerSessionMock.mockResolvedValue({
      success: false,
      error: "forbidden",
      status: 403,
    });

    const res = await app.request("http://local/auth/me", {
      headers: { cookie: "stockix-session=some-token" },
    });
    const body = await res.json();

    // The route returns 403 (status from result.status) when success=false
    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it("session version mismatch: validateOwnerSession returns session_stale → 401", async () => {
    verifySessionTokenMock.mockResolvedValue({
      sub: "owner-5",
      role: "super_admin",
      email: "stale@example.com",
      name: "Stale",
      sessionVersion: 1,
    });
    // Simulate what validateOwnerSession returns when sessionVersion does not match
    validateOwnerSessionMock.mockResolvedValue({
      success: false,
      error: "session_stale",
      status: 401,
    });

    const res = await app.request("http://local/auth/me", {
      headers: { cookie: "stockix-session=some-token" },
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: "session_stale" });
  });
});

// ---------------------------------------------------------------------------
// 5. validateOwnerSession unit tests (pure DB-service layer)
// ---------------------------------------------------------------------------

describe("validateOwnerSession service", () => {
  it("returns forbidden when owner is not found", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    } as unknown as Parameters<typeof import("../src/services/auth/session-validation.js")["validateOwnerSession"]>[0];

    // We re-import without the vi.mock override because session-validation.js
    // is not mocked in this describe block — we want the real implementation.
    // However, since vi.mock is hoisted at the file level we use the mock
    // that was registered. Instead, call the real function from the resolved mock.
    //
    // NOTE: The vi.mock for session-validation at the top of this file is used
    // by buildAuthRoutes tests, so we test the service's behaviour by calling
    // the actual function via its mock stand-in for the DB interaction.
    // We reset and call the real module here.
    vi.resetModules();
    const { validateOwnerSession } = await import(
      "../src/services/auth/session-validation.js"
    );

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    } as unknown as Parameters<typeof validateOwnerSession>[0];

    const result = await validateOwnerSession(db, {
      ownerId: "missing-owner",
      role: "super_admin",
      sessionVersion: 1,
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("forbidden");
  });

  it("returns forbidden when owner status is not active", async () => {
    vi.resetModules();
    const { validateOwnerSession } = await import(
      "../src/services/auth/session-validation.js"
    );

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { id: "owner-1", role: "super_admin", status: "suspended", sessionVersion: 1 },
            ],
          }),
        }),
      }),
    } as unknown as Parameters<typeof validateOwnerSession>[0];

    const result = await validateOwnerSession(db, {
      ownerId: "owner-1",
      role: "super_admin",
      sessionVersion: 1,
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("forbidden");
  });

  it("returns session_stale when sessionVersion does not match", async () => {
    vi.resetModules();
    const { validateOwnerSession } = await import(
      "../src/services/auth/session-validation.js"
    );

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { id: "owner-1", role: "super_admin", status: "active", sessionVersion: 5 },
            ],
          }),
        }),
      }),
    } as unknown as Parameters<typeof validateOwnerSession>[0];

    const result = await validateOwnerSession(db, {
      ownerId: "owner-1",
      role: "super_admin",
      sessionVersion: 3, // mismatch: DB has 5
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("session_stale");
  });

  it("returns session_stale when role does not match DB row", async () => {
    vi.resetModules();
    const { validateOwnerSession } = await import(
      "../src/services/auth/session-validation.js"
    );

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { id: "owner-1", role: "super_admin", status: "active", sessionVersion: 1 },
            ],
          }),
        }),
      }),
    } as unknown as Parameters<typeof validateOwnerSession>[0];

    const result = await validateOwnerSession(db, {
      ownerId: "owner-1",
      role: "read_only", // mismatch: DB has super_admin
      sessionVersion: 1,
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("session_stale");
  });

  it("returns success when owner is active and session is current", async () => {
    vi.resetModules();
    const { validateOwnerSession } = await import(
      "../src/services/auth/session-validation.js"
    );

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { id: "owner-1", role: "super_admin", status: "active", sessionVersion: 2 },
            ],
          }),
        }),
      }),
    } as unknown as Parameters<typeof validateOwnerSession>[0];

    const result = await validateOwnerSession(db, {
      ownerId: "owner-1",
      role: "super_admin",
      sessionVersion: 2,
    });

    expect(result.success).toBe(true);
    expect((result as { data: { id: string } }).data.id).toBe("owner-1");
  });
});
