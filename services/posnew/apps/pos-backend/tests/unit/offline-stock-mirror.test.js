const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

function isStockSyncConflictError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /insufficient stock|out of stock|cannot sell|fulfill|expired lot stock/i.test(msg);
}

function stockSnapshotKey(locationId) {
  return locationId.trim() || "__default__";
}

describe("offline stock mirror helpers", () => {
  it("detects stock-related sync failures", () => {
    assert.equal(
      isStockSyncConflictError(new Error('Insufficient stock for "Burger"')),
      true,
    );
    assert.equal(isStockSyncConflictError(new Error("Network timeout")), false);
  });

  it("uses default snapshot key when location is empty", () => {
    assert.equal(stockSnapshotKey(""), "__default__");
    assert.equal(stockSnapshotKey("loc-abc"), "loc-abc");
  });
});
