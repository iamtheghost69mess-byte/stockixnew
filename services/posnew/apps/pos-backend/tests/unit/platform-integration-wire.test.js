const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const IntegrationConfig = require("../../models/integrationConfigModel");
const AccountingConfig = require("../../models/accountingConfigModel");
const Organization = require("../../models/organizationModel");
const Location = require("../../models/locationModel");

const accountingPath = require.resolve("../../services/accountingService");
const controllerPath = require.resolve("../../controllers/platformIntegrationController");

function stubAccounting() {
  require.cache[accountingPath] = {
    id: accountingPath,
    filename: accountingPath,
    loaded: true,
    exports: {
      ensureDefaultAccountsAndConfig: async () => {},
    },
  };
}

function reloadWireHandler() {
  delete require.cache[controllerPath];
  return require("../../controllers/platformIntegrationController").wireBigcapitalIntegration;
}

function createResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test("wireBigcapitalIntegration enables config and native GL guard", async (t) => {
  const orgId = new mongoose.Types.ObjectId();
  const locId = new mongoose.Types.ObjectId();

  const origOrgFind = Organization.findById;
  const origLocFind = Location.findOne;
  const origIntFind = IntegrationConfig.findOne;
  const origIntUpdate = IntegrationConfig.findOneAndUpdate;
  const origAcctUpdate = AccountingConfig.findOneAndUpdate;
  const prevAccounting = require.cache[accountingPath];

  t.after(() => {
    Organization.findById = origOrgFind;
    Location.findOne = origLocFind;
    IntegrationConfig.findOne = origIntFind;
    IntegrationConfig.findOneAndUpdate = origIntUpdate;
    AccountingConfig.findOneAndUpdate = origAcctUpdate;
    if (prevAccounting) {
      require.cache[accountingPath] = prevAccounting;
    } else {
      delete require.cache[accountingPath];
    }
    delete require.cache[controllerPath];
  });

  Organization.findById = async () => ({ _id: orgId, name: "Test Org" });
  Location.findOne = () => ({
    select: async () => ({ _id: locId }),
  });
  IntegrationConfig.findOne = async () => null;

  let savedBigcapital;
  IntegrationConfig.findOneAndUpdate = async (_query, update) => {
    savedBigcapital = update.$set.bigcapital;
    return {
      toObject() {
        return { organization: orgId, bigcapital: savedBigcapital };
      },
    };
  };

  let acctEnabled;
  AccountingConfig.findOneAndUpdate = async (_query, update) => {
    acctEnabled = update.$set.bigcapitalIntegrationEnabled;
    return {};
  };

  stubAccounting();
  const wireBigcapitalIntegration = reloadWireHandler();

  const req = {
    params: { id: String(orgId) },
    body: {
      enabled: true,
      financeTenantId: 1,
      internalBaseUrl: "http://host.docker.internal:4101",
      internalSecret: "test-secret-key",
      defaultWalkInCustomerId: 10,
      defaultCashDepositAccountId: 20,
      defaultCardDepositAccountId: 21,
      defaultWarehouseId: 30,
      serviceChargeItemId: 88,
      discountItemId: 99,
    },
  };
  const res = createResponse();
  const next = (err) => {
    throw err;
  };

  await wireBigcapitalIntegration(req, res, next);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(savedBigcapital.enabled, true);
  assert.equal(savedBigcapital.financeTenantId, 1);
  assert.equal(savedBigcapital.internalBaseUrl, "http://host.docker.internal:4101");
  assert.equal(acctEnabled, true);
  assert.ok(Array.isArray(savedBigcapital.locationMapping));
  assert.equal(String(savedBigcapital.locationMapping[0].posLocationId), String(locId));
  assert.equal(savedBigcapital.locationMapping[0].bigcapitalWarehouseId, 30);
  assert.equal(savedBigcapital.serviceChargeItemId, 88);
  assert.equal(savedBigcapital.discountItemId, 99);
});
