const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

/** Mirrors pos-frontend2 buildInventoryAdjustDedupeKey for contract stability. */
function buildInventoryAdjustDedupeKey(data) {
  const loc = data.locationId ?? "";
  return `adjust:${data.ingredientId}:${loc}:${data.reason}:${data.quantityDelta}`;
}

describe("inventory adjust offline dedupe key", () => {
  it("is stable for the same adjustment intent", () => {
    const payload = {
      ingredientId: "ing-1",
      locationId: "loc-1",
      reason: "manual_adjust",
      quantityDelta: -2,
    };
    const a = buildInventoryAdjustDedupeKey(payload);
    const b = buildInventoryAdjustDedupeKey(payload);
    assert.equal(a, b);
    assert.equal(a, "adjust:ing-1:loc-1:manual_adjust:-2");
  });

  it("differs when quantity changes", () => {
    const base = {
      ingredientId: "ing-1",
      locationId: "loc-1",
      reason: "correction",
      quantityDelta: 1,
    };
    assert.notEqual(
      buildInventoryAdjustDedupeKey(base),
      buildInventoryAdjustDedupeKey({ ...base, quantityDelta: 2 }),
    );
  });
});
