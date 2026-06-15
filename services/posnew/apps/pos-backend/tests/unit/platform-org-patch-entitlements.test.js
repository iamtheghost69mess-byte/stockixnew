const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Organization = require("../../models/organizationModel");
const User = require("../../models/userModel");
const Location = require("../../models/locationModel");

const auditPath = require.resolve("../../services/platformAuditService");
const controllerPath = require.resolve("../../controllers/platformOrgController");

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

function reloadPatchEntitlements() {
  delete require.cache[controllerPath];
  return require("../../controllers/platformOrgController").patchEntitlements;
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

test("patchEntitlements rejects maxUsers below live staff count", async (t) => {
  const orgId = new mongoose.Types.ObjectId().toString();
  let saveCalls = 0;

  const origFind = Organization.findById;
  const origUserCount = User.countDocuments;
  const origLocCount = Location.countDocuments;
  const prevAudit = require.cache[auditPath];

  t.after(() => {
    Organization.findById = origFind;
    User.countDocuments = origUserCount;
    Location.countDocuments = origLocCount;
    if (prevAudit) {
      require.cache[auditPath] = prevAudit;
    } else {
      delete require.cache[auditPath];
    }
    delete require.cache[controllerPath];
  });

  Organization.findById = async () => ({
    _id: orgId,
    entitlements: {},
    entitlementsSchemaVersion: 1,
    save: async () => {
      saveCalls += 1;
    },
  });
  User.countDocuments = async () => 8;
  Location.countDocuments = async () => 0;

  stubAudit();
  const patchEntitlements = reloadPatchEntitlements();

  const req = {
    params: { id: orgId },
    body: { entitlements: { maxUsers: 3, maxLocations: 10 }, entitlementsSchemaVersion: 1 },
    platformUser: { _id: new mongoose.Types.ObjectId() },
  };
  const res = createResponse();

  await patchEntitlements(req, res, (err) => {
    assert.ok(err);
    assert.equal(err.status, 400);
    assert.match(String(err.message), /maxUsers \(3\) cannot be below current staff count \(8\)/);
  });

  assert.equal(saveCalls, 0);
});

test("patchEntitlements rejects maxLocations below live branch count", async (t) => {
  const orgId = new mongoose.Types.ObjectId().toString();
  let saveCalls = 0;

  const origFind = Organization.findById;
  const origUserCount = User.countDocuments;
  const origLocCount = Location.countDocuments;
  const prevAudit = require.cache[auditPath];

  t.after(() => {
    Organization.findById = origFind;
    User.countDocuments = origUserCount;
    Location.countDocuments = origLocCount;
    if (prevAudit) {
      require.cache[auditPath] = prevAudit;
    } else {
      delete require.cache[auditPath];
    }
    delete require.cache[controllerPath];
  });

  Organization.findById = async () => ({
    _id: orgId,
    entitlements: {},
    entitlementsSchemaVersion: 1,
    save: async () => {
      saveCalls += 1;
    },
  });
  User.countDocuments = async () => 1;
  Location.countDocuments = async () => 4;

  stubAudit();
  const patchEntitlements = reloadPatchEntitlements();

  const req = {
    params: { id: orgId },
    body: { entitlements: { maxUsers: 25, maxLocations: 2 }, entitlementsSchemaVersion: 1 },
    platformUser: { _id: new mongoose.Types.ObjectId() },
  };
  const res = createResponse();

  await patchEntitlements(req, res, (err) => {
    assert.ok(err);
    assert.equal(err.status, 400);
    assert.match(String(err.message), /maxLocations \(2\) cannot be below current branch count \(4\)/);
  });

  assert.equal(saveCalls, 0);
});

test("patchEntitlements saves when caps are at or above live counts", async (t) => {
  const orgId = new mongoose.Types.ObjectId().toString();
  let saveCalls = 0;
  const orgDoc = {
    _id: orgId,
    entitlements: {},
    entitlementsSchemaVersion: 1,
    save: async () => {
      saveCalls += 1;
    },
  };

  const origFind = Organization.findById;
  const origUserCount = User.countDocuments;
  const origLocCount = Location.countDocuments;
  const prevAudit = require.cache[auditPath];

  t.after(() => {
    Organization.findById = origFind;
    User.countDocuments = origUserCount;
    Location.countDocuments = origLocCount;
    if (prevAudit) {
      require.cache[auditPath] = prevAudit;
    } else {
      delete require.cache[auditPath];
    }
    delete require.cache[controllerPath];
  });

  Organization.findById = async () => orgDoc;
  User.countDocuments = async () => 5;
  Location.countDocuments = async () => 2;

  stubAudit();
  const patchEntitlements = reloadPatchEntitlements();

  const req = {
    params: { id: orgId },
    body: {
      entitlements: { maxUsers: 5, maxLocations: 2, modules: { inventory: true } },
      entitlementsSchemaVersion: 2,
    },
    platformUser: { _id: new mongoose.Types.ObjectId() },
  };
  const res = createResponse();

  await patchEntitlements(req, res, (err) => {
    assert.ifError(err);
  });

  assert.equal(saveCalls, 1);
  assert.equal(orgDoc.entitlementsSchemaVersion, 2);
  assert.equal(orgDoc.entitlements.maxUsers, 5);
  assert.equal(orgDoc.entitlements.maxLocations, 2);
  assert.ok(res.body?.success);
});
