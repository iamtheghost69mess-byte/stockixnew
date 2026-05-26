const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Organization = require("../../models/organizationModel");
const User = require("../../models/userModel");

const revealPath = require.resolve("../../services/bootstrapCredentialReveal");
const licensePath = require.resolve("../../services/licenseWindowService");
const auditPath = require.resolve("../../services/platformAuditService");
const controllerPath = require.resolve("../../controllers/platformOrgController");

function stubReveal(peekPayload) {
  require.cache[revealPath] = {
    id: revealPath,
    filename: revealPath,
    loaded: true,
    exports: {
      storeFullCredentials: async () => {},
      peekFullCredentials: async () => peekPayload,
      consumeFullCredentials: async () => peekPayload,
    },
  };
}

function stubLicenseAccess(blocked) {
  require.cache[licensePath] = {
    id: licensePath,
    filename: licensePath,
    loaded: true,
    exports: {
      getOrganizationAccessState: () => ({
        blocked,
        status: blocked ? "suspended" : "active",
        blockCode: blocked ? "ORGANIZATION_NOT_ACTIVE" : null,
      }),
    },
  };
}

function stubAudit() {
  require.cache[auditPath] = {
    id: auditPath,
    filename: auditPath,
    loaded: true,
    exports: {
      writeAudit: async () => {},
      auditFromRequest: () => ({}),
    },
  };
}

function reloadGetOrgProvisioningStatus() {
  delete require.cache[controllerPath];
  return require("../../controllers/platformOrgController").getOrgProvisioningStatus;
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("getOrgProvisioningStatus readyForPinLogin false when not bootstrapped", async (t) => {
  const orgId = new mongoose.Types.ObjectId().toString();
  const origFind = Organization.findById;
  const origCount = User.countDocuments;
  const prevReveal = require.cache[revealPath];
  const prevLicense = require.cache[licensePath];
  const prevAudit = require.cache[auditPath];

  t.after(() => {
    Organization.findById = origFind;
    User.countDocuments = origCount;
    if (prevReveal) require.cache[revealPath] = prevReveal;
    else delete require.cache[revealPath];
    if (prevLicense) require.cache[licensePath] = prevLicense;
    else delete require.cache[licensePath];
    if (prevAudit) require.cache[auditPath] = prevAudit;
    else delete require.cache[auditPath];
    delete require.cache[controllerPath];
  });

  Organization.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: orgId,
        lifecycle: "active",
        isBootstrapped: false,
        slug: "demo",
        name: "Demo",
        provisioningSteps: [],
      }),
    }),
  });
  User.countDocuments = async () => 0;
  stubReveal(null);
  stubLicenseAccess(false);
  stubAudit();

  const handler = reloadGetOrgProvisioningStatus();
  const res = createResponse();
  await handler({ params: { id: orgId } }, res, (err) => {
    if (err) throw err;
  });
  assert.equal(res.body.data.readyForPinLogin, false);
  assert.equal(res.body.data.fullCredentials, undefined);
});

test("getOrgProvisioningStatus readyForPinLogin true includes peeked fullCredentials", async (t) => {
  const orgId = new mongoose.Types.ObjectId().toString();
  const origFind = Organization.findById;
  const origCount = User.countDocuments;
  const prevReveal = require.cache[revealPath];
  const prevLicense = require.cache[licensePath];
  const prevAudit = require.cache[auditPath];
  const peeked = [{ role: "admin", username: "admin", pin: "123456" }];

  t.after(() => {
    Organization.findById = origFind;
    User.countDocuments = origCount;
    if (prevReveal) require.cache[revealPath] = prevReveal;
    else delete require.cache[revealPath];
    if (prevLicense) require.cache[licensePath] = prevLicense;
    else delete require.cache[licensePath];
    if (prevAudit) require.cache[auditPath] = prevAudit;
    else delete require.cache[auditPath];
    delete require.cache[controllerPath];
  });

  Organization.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: orgId,
        lifecycle: "active",
        isBootstrapped: true,
        slug: "demo",
        name: "Demo",
        provisioningSteps: [],
      }),
    }),
  });
  User.countDocuments = async () => 1;
  stubReveal(peeked);
  stubLicenseAccess(false);
  stubAudit();

  const handler = reloadGetOrgProvisioningStatus();
  const res = createResponse();
  await handler({ params: { id: orgId } }, res, (err) => {
    if (err) throw err;
  });
  assert.equal(res.body.data.readyForPinLogin, true);
  assert.deepEqual(res.body.data.fullCredentials, peeked);
});

test("getOrgProvisioningStatus blocked license yields readyForPinLogin false", async (t) => {
  const orgId = new mongoose.Types.ObjectId().toString();
  const origFind = Organization.findById;
  const origCount = User.countDocuments;
  const prevReveal = require.cache[revealPath];
  const prevLicense = require.cache[licensePath];
  const prevAudit = require.cache[auditPath];

  t.after(() => {
    Organization.findById = origFind;
    User.countDocuments = origCount;
    if (prevReveal) require.cache[revealPath] = prevReveal;
    else delete require.cache[revealPath];
    if (prevLicense) require.cache[licensePath] = prevLicense;
    else delete require.cache[licensePath];
    if (prevAudit) require.cache[auditPath] = prevAudit;
    else delete require.cache[auditPath];
    delete require.cache[controllerPath];
  });

  Organization.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: orgId,
        lifecycle: "active",
        isBootstrapped: true,
        slug: "demo",
        name: "Demo",
        provisioningSteps: [],
      }),
    }),
  });
  User.countDocuments = async () => 2;
  stubReveal([{ role: "admin", username: "admin", pin: "123456" }]);
  stubLicenseAccess(true);
  stubAudit();

  const handler = reloadGetOrgProvisioningStatus();
  const res = createResponse();
  await handler({ params: { id: orgId } }, res, (err) => {
    if (err) throw err;
  });
  assert.equal(res.body.data.readyForPinLogin, false);
});
