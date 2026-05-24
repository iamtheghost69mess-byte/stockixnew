const test = require("node:test");
const assert = require("node:assert/strict");
const { hasPermission, P } = require("../../constants/platformPermissions");

test("owner can impersonate", () => {
  assert.equal(
    hasPermission(["platform_owner"], P.IMPERSONATE, []),
    true
  );
});

test("support_read cannot write org", () => {
  assert.equal(
    hasPermission(["platform_support_read"], P.ORG_WRITE, []),
    false
  );
});

test("support_write implies org read", () => {
  assert.equal(
    hasPermission(["platform_support_write"], P.ORG_READ, []),
    true
  );
});
