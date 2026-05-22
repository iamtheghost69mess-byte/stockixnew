const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Org-scoped tenants must not use legacy `ingredient.currentStock`-only paths when
 * `resolveLocationIdOrDefaultForOrg` fails — controllers/services surface 400 instead.
 * This integration-style check runs only when `MONGODB_URI` is set.
 */
test("resolveLocationIdOrDefaultForOrg: rejects location not in organization", async (t) => {
  if (!process.env.MONGODB_URI) {
    t.skip("Set MONGODB_URI to run this check against a real MongoDB.");
    return;
  }
  const mongoose = require("mongoose");
  const stockBalanceService = require("../../services/stockBalanceService");
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const orgId = new mongoose.Types.ObjectId();
    const foreignLocId = new mongoose.Types.ObjectId();
    await assert.rejects(
      () =>
        stockBalanceService.resolveLocationIdOrDefaultForOrg(
          String(foreignLocId),
          String(orgId)
        ),
      /Location not found or not in your organization/
    );
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
});

test("resolveLocationIdOrDefaultForOrg: rejects org with zero locations", async (t) => {
  if (!process.env.MONGODB_URI) {
    t.skip("Set MONGODB_URI to run this check against a real MongoDB.");
    return;
  }
  const mongoose = require("mongoose");
  const Organization = require("../../models/organizationModel");
  const stockBalanceService = require("../../services/stockBalanceService");
  await mongoose.connect(process.env.MONGODB_URI);
  const org = await Organization.create({
    name: `inv-loc-test-${Date.now()}`,
    slug: `inv-loc-test-${Date.now()}`,
  });
  try {
    await assert.rejects(
      () =>
        stockBalanceService.resolveLocationIdOrDefaultForOrg(null, String(org._id)),
      /No locations exist for this organization/
    );
  } finally {
    await Organization.deleteOne({ _id: org._id }).catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }
});
