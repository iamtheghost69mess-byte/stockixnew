/**
 * Security tests for RBAC: requiredApiRole + ROLE_RANK enforcement.
 *
 * `requiredApiRole` is implemented in apps/api/src/middleware/rbac.ts (pure function).
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLE_RANK, ROLES } from "@repo/shared/roles";
import type { Role } from "@repo/shared/roles";
import { requiredApiRole } from "../src/middleware/rbac.js";

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

  it("returns null for POS activate and verify-offline", () => {
    expect(requiredApiRole("/licenses/activate", "POST")).toBeNull();
    expect(requiredApiRole("/licenses/verify-offline", "POST")).toBeNull();
  });

  it("returns null for GET /plans", () => {
    expect(requiredApiRole("/plans", "GET")).toBeNull();
  });

  it("returns null for public tenant orgs", () => {
    expect(requiredApiRole("/public/tenant-orgs/abc", "GET")).toBeNull();
  });

  it("GET /audit-log requires super_admin", () => {
    expect(requiredApiRole("/audit-log", "GET")).toBe("super_admin");
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

  it("tenant organization-access routes require super_admin", () => {
    expect(requiredApiRole("/tenants/tid/organization-access", "GET")).toBe("super_admin");
    expect(requiredApiRole("/tenants/tid/organization-access", "POST")).toBe("super_admin");
    expect(requiredApiRole("/tenants/tid/organization-access/aid", "DELETE")).toBe("super_admin");
  });

  it("POST/PATCH/DELETE tenant organizations require support_agent", () => {
    expect(requiredApiRole("/tenants/tid/organizations", "POST")).toBe("support_agent");
    expect(requiredApiRole("/tenants/tid/organizations/oid", "PATCH")).toBe("support_agent");
    expect(requiredApiRole("/tenants/tid/organizations/oid", "DELETE")).toBe("support_agent");
    expect(requiredApiRole("/tenants/tid/organizations", "GET")).toBe("read_only");
  });

  it("GET /licenses requires read_only", () => {
    expect(requiredApiRole("/licenses", "GET")).toBe("read_only");
    expect(requiredApiRole("/licenses/analytics", "GET")).toBe("read_only");
  });

  it("POST /licenses/:id/extend requires billing_manager", () => {
    expect(requiredApiRole("/licenses/abc-123/extend", "POST")).toBe("billing_manager");
  });

  it("PATCH /licenses/:id requires billing_manager", () => {
    expect(requiredApiRole("/licenses/abc-123", "PATCH")).toBe("billing_manager");
  });

  it("POST /licenses/generate requires super_admin", () => {
    expect(requiredApiRole("/licenses/generate", "POST")).toBe("super_admin");
  });

  it("POST /fingerprints/blacklist requires super_admin", () => {
    expect(requiredApiRole("/fingerprints/blacklist", "POST")).toBe("super_admin");
  });

  it("unknown paths default to read_only", () => {
    expect(requiredApiRole("/unknown-route", "GET")).toBe("read_only");
  });
});

// ---------------------------------------------------------------------------
// 3. Role enforcement: read_only vs. super_admin access checks
// ---------------------------------------------------------------------------

describe("role rank enforcement logic", () => {
  function isAllowed(actorRole: Role, requiredRole: Role): boolean {
    if (!(actorRole in ROLE_RANK)) return false;
    return ROLE_RANK[actorRole] >= ROLE_RANK[requiredRole];
  }

  it("read_only can access GET /tenants (requires read_only)", () => {
    expect(isAllowed("read_only", requiredApiRole("/tenants", "GET")!)).toBe(true);
  });

  it("read_only cannot POST /licenses/:id/extend (requires billing_manager)", () => {
    expect(isAllowed("read_only", requiredApiRole("/licenses/x/extend", "POST")!)).toBe(false);
  });

  it("billing_manager can POST /licenses/:id/extend", () => {
    expect(isAllowed("billing_manager", requiredApiRole("/licenses/x/extend", "POST")!)).toBe(true);
  });

  it("billing_manager cannot POST /licenses/generate (requires super_admin)", () => {
    expect(isAllowed("billing_manager", requiredApiRole("/licenses/generate", "POST")!)).toBe(false);
  });

  it("read_only cannot access POST /tenants (requires super_admin)", () => {
    expect(isAllowed("read_only", requiredApiRole("/tenants", "POST")!)).toBe(false);
  });

  it("read_only cannot DELETE /owners/:id (requires super_admin)", () => {
    expect(isAllowed("read_only", requiredApiRole("/owners/id", "DELETE")!)).toBe(false);
  });

  it("read_only cannot POST /licenses/generate (requires super_admin)", () => {
    expect(isAllowed("read_only", requiredApiRole("/licenses/generate", "POST")!)).toBe(false);
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

  it("support_agent cannot manage organization-access grants (requires super_admin)", () => {
    expect(
      isAllowed("support_agent", requiredApiRole("/tenants/tid/organization-access", "GET")!),
    ).toBe(false);
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
      ["/tenants/tid/organization-access", "GET"],
      ["/licenses/generate", "POST"],
    ];
    for (const [path, method] of routes) {
      const required = requiredApiRole(path, method);
      if (required === null) continue;
      expect(isAllowed("super_admin", required)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Session-layer RBAC via buildAuthRoutes — test /auth/me
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
    expect(body.me.capabilities.canExtendLicenses).toBe(false);
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
    expect(body.me.capabilities.canExtendLicenses).toBe(true);
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
    expect(body.me.capabilities.canExtendLicenses).toBe(true);
  });

  it("billing_manager session: /auth/me returns tenant ops false, license extend true", async () => {
    verifySessionTokenMock.mockResolvedValue({
      sub: "owner-bm",
      role: "billing_manager",
      email: "billing@example.com",
      name: "Billing",
      sessionVersion: 1,
    });
    validateOwnerSessionMock.mockResolvedValue({
      success: true,
      data: { id: "owner-bm" },
    });

    const res = await app.request("http://local/auth/me", {
      headers: { cookie: "stockix-session=some-token" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.me.role).toBe("billing_manager");
    expect(body.me.capabilities.canManageTenants).toBe(false);
    expect(body.me.capabilities.canExtendLicenses).toBe(true);
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
    validateOwnerSessionMock.mockResolvedValue({
      success: false,
      error: "forbidden",
      status: 403,
    });

    const res = await app.request("http://local/auth/me", {
      headers: { cookie: "stockix-session=some-token" },
    });
    const body = await res.json();

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
