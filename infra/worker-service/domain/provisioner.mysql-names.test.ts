import { describe, expect, it } from "vitest";

import { tenantMysqlDatabaseNames, tenantMysqlUsername, mysqlLikePatternEscape } from "./provisioner.js";

describe("tenantMysqlDatabaseNames", () => {
  it("includes legacy finance DB in provision/deprovision pair", () => {
    const names = tenantMysqlDatabaseNames("acme-corp");
    expect(names.financeDb).toBe("stockix_acme_corp_finance");
    expect(names.systemDb).toBe("stockix_acme_corp_system");
    expect(names.tenantUser).toBe("tenant_acme_corp");
    expect(names.orgDbPattern).toBe("stockix_acme_corp_%");
  });

  it("truncates MySQL username to 32 characters for long slugs", () => {
    const slug = "e2e-full-mq3hj780-3b633750";
    const user = tenantMysqlUsername(slug);
    expect(user.length).toBeLessThanOrEqual(32);
    expect(user.startsWith("tenant_")).toBe(true);
    expect(tenantMysqlDatabaseNames(slug).tenantUser).toBe(user);
  });

  it("escapes underscores in MySQL LIKE patterns for slug-safe DB names", () => {
    const pattern = tenantMysqlDatabaseNames("e2e-fail-inject").orgDbPattern;
    expect(mysqlLikePatternEscape(pattern)).toBe("stockix\\_e2e\\_fail\\_inject\\_\\%");
  });
});
