import { beforeEach, describe, expect, it, vi } from "vitest";

const { createConnection, execa } = vi.hoisted(() => ({
  createConnection: vi.fn(),
  execa: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({
  default: { createConnection },
  createConnection,
}));

vi.mock("execa", () => ({
  execa,
}));

import { escapeProxySqlLiteral, registerMysqlUserInProxySql } from "./provisioner.js";

describe("escapeProxySqlLiteral", () => {
  it("escapes single quotes for docker exec SQL", () => {
    expect(escapeProxySqlLiteral("tenant_o'brien")).toBe("tenant_o''brien");
  });
});

describe("registerMysqlUserInProxySql", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WORKER_SHARED_MYSQL_HOST = "127.0.0.1";
    delete process.env.PROXYSQL_ADMIN_USER;
    delete process.env.PROXYSQL_ADMIN_PASSWORD;
  });

  it("registers user via admin connection and verifies tenant login on 6033", async () => {
    const adminConn = {
      query: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
    };
    const tenantConn = {
      query: vi.fn().mockResolvedValue([[{ "1": 1 }]]),
      end: vi.fn().mockResolvedValue(undefined),
    };
    createConnection
      .mockResolvedValueOnce(adminConn)
      .mockResolvedValueOnce(tenantConn);

    const logs: string[] = [];
    await registerMysqlUserInProxySql("tenant_acme", "secret-pass", (m) => logs.push(m));

    expect(adminConn.query).toHaveBeenCalledWith("DELETE FROM mysql_users WHERE username = ?", [
      "tenant_acme",
    ]);
    expect(tenantConn.query).toHaveBeenCalledWith("SELECT 1");
    expect(logs.some((line) => line.includes("ProxySQL user registered: tenant_acme"))).toBe(true);
    expect(logs.some((line) => line.includes("ProxySQL tenant login verified"))).toBe(true);
    expect(execa).not.toHaveBeenCalled();
  });

  it("throws when direct admin connect and docker exec fallback both fail", async () => {
    createConnection.mockRejectedValue(new Error("ECONNREFUSED"));
    execa.mockRejectedValue(new Error("container not found"));

    await expect(
      registerMysqlUserInProxySql("tenant_acme", "secret-pass", () => {}),
    ).rejects.toThrow(/ProxySQL user sync failed for tenant_acme/);
  });
});
