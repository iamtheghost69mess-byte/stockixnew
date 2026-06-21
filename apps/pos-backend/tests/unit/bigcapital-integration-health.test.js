const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateBigcapitalIntegrationHealth,
} = require("../../services/bigcapitalIntegrationHealth");

test("evaluateBigcapitalIntegrationHealth passes when fully configured", () => {
  const result = evaluateBigcapitalIntegrationHealth({
    bigcapital: {
      enabled: true,
      financeTenantId: 1,
      internalBaseUrl: "http://finance:3000",
      internalSecret: "secret",
      defaultWalkInCustomerId: 2,
      defaultCashDepositAccountId: 3,
      defaultCardDepositAccountId: 4,
    },
  });
  assert.equal(result.healthy, true);
});

test("evaluateBigcapitalIntegrationHealth fails when disabled", () => {
  const result = evaluateBigcapitalIntegrationHealth({
    bigcapital: { enabled: false, financeTenantId: 1 },
  });
  assert.equal(result.healthy, false);
  assert.equal(result.reason, "integration_disabled");
});

test("evaluateBigcapitalIntegrationHealth requires accounting flag when requested", () => {
  const result = evaluateBigcapitalIntegrationHealth(
    {
      bigcapital: {
        enabled: true,
        financeTenantId: 1,
        internalBaseUrl: "http://finance:3000",
        internalSecret: "secret",
        defaultWalkInCustomerId: 2,
        defaultCashDepositAccountId: 3,
        defaultCardDepositAccountId: 4,
      },
    },
    { requireAccountingFlag: true, accountingIntegrationEnabled: false }
  );
  assert.equal(result.healthy, false);
  assert.equal(result.reason, "accounting_integration_flag_off");
});
