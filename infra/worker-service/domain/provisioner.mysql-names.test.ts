import { describe, expect, it } from "vitest";

import { tenantMysqlDatabaseNames } from "./provisioner.js";

describe("tenantMysqlDatabaseNames", () => {
  it("includes legacy finance DB in provision/deprovision pair", () => {
    const names = tenantMysqlDatabaseNames("acme-corp");
    expect(names.financeDb).toBe("stockix_acme_corp_finance");
    expect(names.systemDb).toBe("stockix_acme_corp_system");
    expect(names.tenantUser).toBe("tenant_acme_corp");
    expect(names.orgDbPattern).toBe("stockix_acme_corp_%");
  });
});
