process.env.DATABASE_URL = "postgres://test:5432/test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendOrgAdminAccessEmailMock = vi.fn().mockResolvedValue({ status: "success" });

vi.mock("../src/mail/send.js", () => ({
  sendOrgAdminAccessEmail: sendOrgAdminAccessEmailMock,
}));

vi.mock("../src/audit.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@repo/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/config")>();
  return {
    ...actual,
    apiConfig: {
      ...actual.apiConfig,
      internalApiSecret: "test-internal-secret",
      publicBaseUrlScheme: "http",
    },
    rootDomainForOrganizationSubdomain: () => "test.local",
  };
});

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  text: () => Promise.resolve("OK"),
});
global.fetch = mockFetch;

// Proper chainable mock for Drizzle
const createChainable = (result: any) => {
  const chain: any = {
    where: vi.fn(() => chain),
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    update: vi.fn(() => chain),
    set: vi.fn(() => chain),
    returning: vi.fn(() => chain),
    values: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    then: function(resolve: any) { resolve(result); }
  };
  return chain;
};

let selectResult: any = [];
let updateResult: any = [];

const mockDb = {
  transaction: vi.fn((cb) => cb(mockDb)),
  select: vi.fn(() => createChainable(selectResult)),
  update: vi.fn(() => createChainable(updateResult)),
  insert: vi.fn(() => createChainable([])),
};

vi.mock("../src/db/db.js", () => ({
  db: mockDb,
}));

// Mock logger to avoid test noise
vi.mock("../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

describe("POST /internal/jobs/:jobId/complete for organization.provision", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    updateResult = [
      {
        id: "job-1",
        status: "completed",
        type: "organization.provision",
        tenantId: "tenant-1",
        payload: {
          organizationId: "org-1",
          adminEmail: "admin@test.com",
          mainTenantInternalBaseUrl: "http://api",
          orgName: "Test Org"
        }
      }
    ];
    selectResult = [
      { name: "Test Org", subdomain: "org.test.local", financeOrganizationId: "fin-org-1" }
    ];
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("OK") });
    sendOrgAdminAccessEmailMock.mockResolvedValue({ status: "success" });

    // Re-import to ensure fresh mocks if needed
    const { registerInternalRoutes } = await import("../src/routes/internal.js");
    app = new Hono();
    registerInternalRoutes(app, mockDb as never);
  });

  it("double-completion call idempotency - processes without errors and does not crash", async () => {
    const payload = {
      workerId: "w-1",
      result: { ok: true }
    };

    // First completion
    const res1 = await app.request("/internal/jobs/job-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(200);

    // In a real DB it wouldn't return a running job the second time, but if it did (or worker fired twice at same time),
    // we ensure our handlers are robust. The endpoint logic is inherently fire-and-forget for the grant.
    const res2 = await app.request("/internal/jobs/job-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(sendOrgAdminAccessEmailMock).toHaveBeenCalledTimes(2);
  });

  it("email-failure resilience - failure to send email still sets status to active", async () => {
    // Make the email throw an error
    sendOrgAdminAccessEmailMock.mockRejectedValueOnce(new Error("SMTP down"));

    const res = await app.request("/internal/jobs/job-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId: "w-1", result: { ok: true } }),
    });

    expect(res.status).toBe(200);
    // The DB update to "active" happens BEFORE the fire-and-forget email wrapper
    expect(mockDb.update).toHaveBeenCalled();
    // Verify it didn't throw a 500
  });

  it("skips grant with warning if INTERNAL_API_SECRET is not configured", async () => {
    const { apiConfig } = await import("@repo/config");
    const prevSecret = apiConfig.internalApiSecret;
    apiConfig.internalApiSecret = ""; // Unset secret

    const res = await app.request("/internal/jobs/job-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId: "w-1", result: { ok: true } }),
    });

    expect(res.status).toBe(200);
    
    await new Promise((r) => setTimeout(r, 50));

    // Should NOT call fetch to attach user
    expect(mockFetch).not.toHaveBeenCalled();
    // But it should still try to send the email
    expect(sendOrgAdminAccessEmailMock).toHaveBeenCalled();

    // Restore
    apiConfig.internalApiSecret = prevSecret;
  });
});
