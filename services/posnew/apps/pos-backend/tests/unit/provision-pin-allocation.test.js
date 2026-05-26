const test = require("node:test");
const assert = require("node:assert/strict");

const { randomProvisionPinDigits } = require("../../services/orgBootstrapService");

test("randomProvisionPinDigits matches login rule 4-6 digits", () => {
  for (let i = 0; i < 200; i++) {
    const pin = randomProvisionPinDigits();
    assert.match(pin, /^\d{4,6}$/, `invalid pin: ${pin}`);
    assert.ok(pin.length >= 4 && pin.length <= 6);
  }
});
