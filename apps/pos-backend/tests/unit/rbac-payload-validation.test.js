"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateRbacConfigPayload,
  validateRbacPayload,
  isValidPermissionToken,
} = require("../../utils/rbacPayloadValidation");

describe("rbacPayloadValidation", () => {
  it("accepts known permission ids and *", () => {
    assert.equal(isValidPermissionToken("*"), true);
    assert.equal(isValidPermissionToken("pos.order.read"), true);
    assert.equal(isValidPermissionToken("backoffice.accounting.gl.read"), true);
  });

  it("accepts glob stems that cover catalog ids", () => {
    assert.equal(isValidPermissionToken("pos.table.*"), true);
    assert.equal(isValidPermissionToken("backoffice.accounting.*"), true);
  });

  it("rejects unknown tokens", () => {
    assert.equal(isValidPermissionToken("not.a.real.permission"), false);
    assert.equal(isValidPermissionToken("pos.fake.*"), false);
  });

  it("validates builtinOverrides and customRoles", () => {
    assert.equal(
      validateRbacConfigPayload(
        { manager: { can: ["pos.order.read", "bad.token"] } },
        null
      ),
      'builtinOverrides.manager: unknown or invalid permission "bad.token".'
    );
    assert.equal(
      validateRbacConfigPayload(null, [{ key: "x", label: "X", can: ["*"] }]),
      null
    );
  });

  it("rejects unknown built-in override keys", () => {
    assert.equal(
      validateRbacPayload({ not_a_role: { can: ["*"] } }, null),
      'builtinOverrides: unknown built-in role key "not_a_role".'
    );
  });

  it("rejects invalid inheritsFrom on custom roles", () => {
    assert.equal(
      validateRbacPayload(null, [
        { key: "foo", label: "Foo", inheritsFrom: "nope", can: ["pos.order.read"] },
      ]),
      'customRoles[0]: inheritsFrom must be a built-in role key; got "nope".'
    );
  });

  it("rejects duplicate custom role keys", () => {
    assert.equal(
      validateRbacPayload(null, [
        { key: "dup", label: "A", can: ["pos.order.read"] },
        { key: "dup", label: "B", can: ["pos.order.read"] },
      ]),
      'customRoles[1]: duplicate custom role key "dup".'
    );
  });

  it("aliases validateRbacPayload to validateRbacConfigPayload", () => {
    assert.equal(
      validateRbacPayload({ manager: { can: ["bad"] } }, null),
      validateRbacConfigPayload({ manager: { can: ["bad"] } }, null)
    );
  });
});
