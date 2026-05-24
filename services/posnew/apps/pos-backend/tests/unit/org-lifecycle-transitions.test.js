const test = require("node:test");
const assert = require("node:assert/strict");
const { validateLifecycleTransition } = require("../../utils/orgLifecycleTransitions");

test("allows idempotent lifecycle", () => {
  assert.deepEqual(validateLifecycleTransition("active", "active"), { ok: true });
});

test("allows suspend from active", () => {
  assert.deepEqual(validateLifecycleTransition("active", "suspended"), { ok: true });
});

test("allows reactivate from suspended", () => {
  assert.deepEqual(validateLifecycleTransition("suspended", "active"), { ok: true });
});

test("rejects jump from draft to suspended", () => {
  const r = validateLifecycleTransition("draft", "suspended");
  assert.equal(r.ok, false);
  assert.ok(String(r.message).includes("Cannot change lifecycle"));
});

test("rejects transitions from deleted", () => {
  const r = validateLifecycleTransition("deleted", "active");
  assert.equal(r.ok, false);
});
