const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Mirrors `grnService.confirmGRN` lot predicate: persist lot when any of
 * expiry, lot number, supplier batch ref, or production date is present.
 */
function shouldTrackGrnLot(line) {
  const lotNum = line.lotNumber != null ? String(line.lotNumber).trim() : "";
  const batchRef =
    line.supplierBatchRef != null ? String(line.supplierBatchRef).trim() : "";
  return (
    !!line.expiryDate ||
    lotNum.length > 0 ||
    batchRef.length > 0 ||
    !!line.productionDate
  );
}

test("GRN lot tracking: expiry alone", () => {
  assert.equal(shouldTrackGrnLot({ expiryDate: new Date("2026-01-01") }), true);
});

test("GRN lot tracking: trimmed lot number", () => {
  assert.equal(shouldTrackGrnLot({ lotNumber: "  LN-1  " }), true);
});

test("GRN lot tracking: supplier batch ref", () => {
  assert.equal(shouldTrackGrnLot({ supplierBatchRef: " B-99 " }), true);
});

test("GRN lot tracking: production date", () => {
  assert.equal(shouldTrackGrnLot({ productionDate: new Date("2025-06-01") }), true);
});

test("GRN lot tracking: no signals", () => {
  assert.equal(shouldTrackGrnLot({}), false);
  assert.equal(shouldTrackGrnLot({ lotNumber: "   " }), false);
});
