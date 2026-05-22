const test = require("node:test");
const assert = require("node:assert/strict");
const { maxUsersFromEntitlements } = require("../../services/entitlementService");

test("maxUsersFromEntitlements defaults when missing or invalid", () => {
  assert.equal(maxUsersFromEntitlements({}), 25);
  assert.equal(maxUsersFromEntitlements(undefined), 25);
  assert.equal(maxUsersFromEntitlements({ maxUsers: "x" }), 25);
  assert.equal(maxUsersFromEntitlements({ maxUsers: -1 }), 25);
});

test("maxUsersFromEntitlements reads configured cap", () => {
  assert.equal(maxUsersFromEntitlements({ maxUsers: 5 }), 5);
  assert.equal(maxUsersFromEntitlements({ maxUsers: 0 }), 0);
});
