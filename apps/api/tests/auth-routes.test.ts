import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/config", () => ({
  apiConfig: {
    nodeEnv: "test",
    publicBaseUrlScheme: "http",
    dashboardUrl: "http://local",
  },
  mailConfig: {
    host: "smtp.resend.com",
    port: 587,
    username: "resend",
    password: "",
    secure: false,
    fromName: "Stockix",
    fromAddress: "",
  },
  isMailConfigured: () => false,
  getMailHealthStatus: () => ({ configured: false, fromAddressSet: false }),
}));

const loginOwnerMock = vi.fn();
const reconfirmOwnerPasswordMock = vi.fn();
const validateOwnerSessionMock = vi.fn();
const beginMfaSetupMock = vi.fn();
const enableMfaMock = vi.fn();
const disableMfaMock = vi.fn();
const getMfaStatusMock = vi.fn();
const verifyMfaCodeMock = vi.fn();
const acceptInviteMock = vi.fn();
const getInviteByTokenMock = vi.fn();
const signMfaTokenMock = vi.fn();
const signSessionTokenMock = vi.fn();
const verifyMfaTokenMock = vi.fn();
const verifySessionTokenMock = vi.fn();

vi.mock("../src/services/auth/login.js", () => ({
  loginOwner: loginOwnerMock,
  reconfirmOwnerPassword: reconfirmOwnerPasswordMock,
}));

vi.mock("../src/services/auth/session-validation.js", () => ({
  validateOwnerSession: validateOwnerSessionMock,
}));

vi.mock("../src/services/mfa/mfa.js", () => ({
  beginMfaSetup: beginMfaSetupMock,
  enableMfa: enableMfaMock,
  disableMfa: disableMfaMock,
  getMfaStatus: getMfaStatusMock,
  verifyMfaCode: verifyMfaCodeMock,
}));

vi.mock("../src/services/invites/invites.js", () => ({
  acceptInvite: acceptInviteMock,
  getInviteByToken: getInviteByTokenMock,
}));

vi.mock("../src/services/auth/tokens.js", () => ({
  signMfaToken: signMfaTokenMock,
  signSessionToken: signSessionTokenMock,
  verifyMfaToken: verifyMfaTokenMock,
  verifySessionToken: verifySessionTokenMock,
}));

describe("auth route contracts", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { buildAuthRoutes } = await import("../src/routes/auth/index.js");
    app = new Hono();
    app.route("/auth", buildAuthRoutes({} as never));
  });

  it("returns mfa_required when login requires mfa and code missing", async () => {
    loginOwnerMock.mockResolvedValue({
      success: true,
      data: { requiresMfa: true, ownerId: "owner-1" },
    });
    signMfaTokenMock.mockResolvedValue("mfa-token");

    const res = await app.request("http://local/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@x.com", password: "pass" }),
      headers: { "content-type": "application/json", origin: "http://local" },
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: "mfa_required", requiresMfa: true });
    expect(res.headers.get("set-cookie")).toContain("stockix-mfa=");
  });

  it("returns success + session cookie when login with MFA code succeeds", async () => {
    loginOwnerMock.mockResolvedValue({
      success: true,
      data: { requiresMfa: true, ownerId: "owner-1" },
    });
    verifyMfaCodeMock.mockResolvedValue({
      success: true,
      data: {
        id: "owner-1",
        role: "super_admin",
        email: "admin@x.com",
        name: "Admin",
        sessionVersion: 4,
      },
    });
    signSessionTokenMock.mockResolvedValue("session-token");

    const res = await app.request("http://local/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@x.com", password: "pass", code: "123456" }),
      headers: { "content-type": "application/json", origin: "http://local" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, ok: true });
    expect(res.headers.get("set-cookie")).toContain("stockix-session=");
  });

  it("returns /auth/me with capability flags from API authority", async () => {
    verifySessionTokenMock.mockResolvedValue({
      sub: "owner-1",
      role: "super_admin",
      email: "admin@x.com",
      name: "Admin",
      sessionVersion: 2,
    });
    validateOwnerSessionMock.mockResolvedValue({ success: true, data: { id: "owner-1" } });

    const res = await app.request("http://local/auth/me", {
      headers: { cookie: "stockix-session=session-token" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      me: {
        id: "owner-1",
        role: "super_admin",
        capabilities: {
          canAccessSettings: true,
          canManageOwners: true,
          canManageTenants: true,
          canExtendLicenses: true,
        },
      },
    });
  });

  it("returns logout success and expires cookies", async () => {
    const res = await app.request("http://local/auth/logout", {
      method: "POST",
      headers: { origin: "http://local" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, ok: true });
    expect(res.headers.get("set-cookie")).toContain("stockix-session=;");
  });
});
