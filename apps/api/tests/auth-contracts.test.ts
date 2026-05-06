import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loginOwnerMock = vi.fn();
const reconfirmOwnerPasswordMock = vi.fn();
const validateOwnerSessionMock = vi.fn();
const getInviteByTokenMock = vi.fn();
const acceptInviteMock = vi.fn();
const verifySessionTokenMock = vi.fn();

vi.mock("../src/services/auth/login.js", () => ({
  loginOwner: loginOwnerMock,
  reconfirmOwnerPassword: reconfirmOwnerPasswordMock,
}));
vi.mock("../src/services/auth/session-validation.js", () => ({
  validateOwnerSession: validateOwnerSessionMock,
}));
vi.mock("../src/services/invites/invites.js", () => ({
  getInviteByToken: getInviteByTokenMock,
  acceptInvite: acceptInviteMock,
}));
vi.mock("../src/services/auth/tokens.js", () => ({
  signMfaToken: vi.fn(),
  signSessionToken: vi.fn(),
  verifyMfaToken: vi.fn(),
  verifySessionToken: verifySessionTokenMock,
}));
vi.mock("../src/services/mfa/mfa.js", () => ({
  beginMfaSetup: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
  getMfaStatus: vi.fn(),
  verifyMfaCode: vi.fn(),
}));

describe("auth API contract errors", () => {
  let app: Hono;
  beforeEach(async () => {
    vi.clearAllMocks();
    const { buildAuthRoutes } = await import("../src/routes/auth/index.js");
    app = new Hono();
    app.route("/auth", buildAuthRoutes({} as never));
  });

  it("returns invalid body on malformed login input", async () => {
    const res = await app.request("http://local/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email" }),
      headers: { "content-type": "application/json" },
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: "Invalid request body" });
  });

  it("returns unauthorized for /auth/me without session", async () => {
    verifySessionTokenMock.mockResolvedValue(null);
    const res = await app.request("http://local/auth/me");
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: "unauthorized" });
  });

  it("returns 404 for invalid invite token contract", async () => {
    const res = await app.request("http://local/auth/invite/not-a-uuid");
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body).toMatchObject({ success: false });
  });
});
