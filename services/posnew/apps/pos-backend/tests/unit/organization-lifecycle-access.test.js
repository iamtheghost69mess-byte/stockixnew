const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getOrganizationAccessState,
} = require("@restaurant-pos/domain-access");

test("getOrganizationAccessState blocks suspended lifecycle with ORGANIZATION_NOT_ACTIVE", () => {
  const state = getOrganizationAccessState({
    lifecycle: "suspended",
    licenseStartDate: "2020-01-01T00:00:00.000Z",
    licenseEndDate: "2030-12-31T23:59:59.000Z",
    timezone: "UTC",
    now: new Date("2026-06-01T00:00:00.000Z"),
  });
  assert.equal(state.blocked, true);
  assert.equal(state.blockCode, "ORGANIZATION_NOT_ACTIVE");
  assert.equal(state.status, "suspended");
});

test("getOrganizationAccessState allows active lifecycle inside license window", () => {
  const state = getOrganizationAccessState({
    lifecycle: "active",
    licenseStartDate: "2020-01-01T00:00:00.000Z",
    licenseEndDate: "2030-12-31T23:59:59.000Z",
    timezone: "UTC",
    now: new Date("2026-06-01T00:00:00.000Z"),
  });
  assert.equal(state.blocked, false);
  assert.equal(state.status, "active");
});
