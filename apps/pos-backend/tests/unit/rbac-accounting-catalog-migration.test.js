"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasAccountingWildcard,
  computeReadBundleAdds,
  computeWriteBundleAdds,
  computeAllAdds,
  applyAdds,
  READ_BUNDLE,
  WRITE_BUNDLE,
} = require("../../scripts/lib/rbacAccountingCatalogMigration");

test("hasAccountingWildcard detects stems", () => {
  assert.equal(hasAccountingWildcard(["backoffice.accounting.gl.read"]), false);
  assert.equal(hasAccountingWildcard(["backoffice.accounting.*"]), true);
  assert.equal(hasAccountingWildcard(["backoffice.*"]), true);
  assert.equal(hasAccountingWildcard(["*"]), true);
});

test("read bundle: GL read + accounting read without new ids → three adds", () => {
  const can = [
    "backoffice.accounting.read",
    "backoffice.accounting.gl.read",
    "backoffice.accounting.ar.read",
  ];
  const adds = computeReadBundleAdds(can);
  assert.deepEqual(adds, [...READ_BUNDLE]);
});

test("read bundle: missing only one new id → single add", () => {
  const can = [
    "backoffice.accounting.read",
    "backoffice.accounting.gl.read",
    "backoffice.accounting.expenses.read",
    "backoffice.accounting.approvals.read",
  ];
  assert.deepEqual(computeReadBundleAdds(can), ["backoffice.accounting.consolidated.read"]);
});

test("read bundle: wildcard → no adds", () => {
  const can = ["backoffice.accounting.*"];
  assert.deepEqual(computeReadBundleAdds(can), []);
});

test("read bundle: AP read only → no adds", () => {
  const can = ["backoffice.accounting.read", "backoffice.accounting.ap.read"];
  assert.deepEqual(computeReadBundleAdds(can), []);
});

test("write bundle: off by default in computeAllAdds", () => {
  const can = ["backoffice.accounting.gl.write", "backoffice.accounting.read"];
  assert.deepEqual(computeAllAdds(can, false), []);
});

test("write bundle: gl.write + includeWrites → two adds", () => {
  const can = ["backoffice.accounting.gl.write", "backoffice.accounting.read"];
  assert.deepEqual(computeAllAdds(can, true), [...WRITE_BUNDLE]);
});

test("write bundle: wildcard suppresses", () => {
  const can = ["backoffice.accounting.*", "backoffice.accounting.gl.write"];
  assert.deepEqual(computeWriteBundleAdds(can, true), []);
});

test("applyAdds is idempotent", () => {
  const base = ["backoffice.accounting.gl.read", "backoffice.accounting.expenses.read"];
  const merged = applyAdds(base, ["backoffice.accounting.expenses.read", "a"]);
  assert.deepEqual(merged, [...base, "a"]);
});
