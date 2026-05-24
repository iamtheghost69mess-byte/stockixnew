"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

describe("pinLookup", () => {
  const originalSecret = process.env.JWT_SECRET;

  before(() => {
    process.env.JWT_SECRET = "test-pin-lookup-secret";
  });

  after(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
    delete require.cache[require.resolve("../../config/config")];
    delete require.cache[require.resolve("../../utils/pinLookup")];
  });

  it("computePinLookup is deterministic for the same PIN", () => {
    const { computePinLookup } = require("../../utils/pinLookup");
    const a = computePinLookup("123456");
    const b = computePinLookup("123456");
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  it("createPinLookup ignores organizationId for the stored hash", () => {
    const { computePinLookup, createPinLookup } = require("../../utils/pinLookup");
    const orgA = "507f1f77bcf86cd799439011";
    const orgB = "507f1f77bcf86cd799439012";
    assert.equal(createPinLookup("654321", orgA), computePinLookup("654321"));
    assert.equal(createPinLookup("654321", orgB), computePinLookup("654321"));
  });

  it("different PINs produce different lookup hashes", () => {
    const { computePinLookup } = require("../../utils/pinLookup");
    assert.notEqual(computePinLookup("123456"), computePinLookup("123457"));
  });
});
