const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Organization = require("../../models/organizationModel");
const {
  assertCanCreatePlatformOrg,
  isCombinedPosStack,
} = require("../../services/combinedOrgProvisionGuard");

test("isCombinedPosStack is true when FINANCE_INTERNAL_BASE_URL is set", () => {
  const prev = process.env.FINANCE_INTERNAL_BASE_URL;
  process.env.FINANCE_INTERNAL_BASE_URL = "http://finance:3000";
  try {
    assert.equal(isCombinedPosStack(), true);
  } finally {
    if (prev === undefined) {
      delete process.env.FINANCE_INTERNAL_BASE_URL;
    } else {
      process.env.FINANCE_INTERNAL_BASE_URL = prev;
    }
  }
});

test("assertCanCreatePlatformOrg allows stockix-provision idempotency on combined stack", async () => {
  const prev = process.env.FINANCE_INTERNAL_BASE_URL;
  process.env.FINANCE_INTERNAL_BASE_URL = "http://finance:3000";
  const origCount = Organization.countDocuments;
  Organization.countDocuments = async () => 2;

  try {
    await assertCanCreatePlatformOrg({
      stockixTenantId: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "stockix-provision-abc",
    });
  } finally {
    Organization.countDocuments = origCount;
    if (prev === undefined) {
      delete process.env.FINANCE_INTERNAL_BASE_URL;
    } else {
      process.env.FINANCE_INTERNAL_BASE_URL = prev;
    }
  }
});

test("assertCanCreatePlatformOrg blocks second org on combined stack", async () => {
  const prev = process.env.FINANCE_INTERNAL_BASE_URL;
  process.env.FINANCE_INTERNAL_BASE_URL = "http://finance:3000";
  const origCount = Organization.countDocuments;
  Organization.countDocuments = async () => 1;

  try {
    await assert.rejects(
      () =>
        assertCanCreatePlatformOrg({
          stockixTenantId: "00000000-0000-4000-8000-000000000001",
          idempotencyKey: "",
        }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.code, "COMBINED_ORG_REQUIRES_CONTROL_PLANE");
        return true;
      }
    );
  } finally {
    Organization.countDocuments = origCount;
    if (prev === undefined) {
      delete process.env.FINANCE_INTERNAL_BASE_URL;
    } else {
      process.env.FINANCE_INTERNAL_BASE_URL = prev;
    }
  }
});

test("assertCanCreatePlatformOrg allows first org on combined stack", async () => {
  const prev = process.env.FINANCE_INTERNAL_BASE_URL;
  process.env.FINANCE_INTERNAL_BASE_URL = "http://finance:3000";
  const origCount = Organization.countDocuments;
  Organization.countDocuments = async () => 0;

  try {
    await assertCanCreatePlatformOrg({
      stockixTenantId: new mongoose.Types.ObjectId().toString(),
      idempotencyKey: "",
    });
  } finally {
    Organization.countDocuments = origCount;
    if (prev === undefined) {
      delete process.env.FINANCE_INTERNAL_BASE_URL;
    } else {
      process.env.FINANCE_INTERNAL_BASE_URL = prev;
    }
  }
});
