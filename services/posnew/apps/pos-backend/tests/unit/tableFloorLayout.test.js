const test = require("node:test");
const assert = require("node:assert/strict");

const { deriveTableStatusFromLayout } = require("../../utils/tableFloorLayout");

test("deriveTableStatusFromLayout respects explicit status", () => {
  assert.equal(deriveTableStatusFromLayout({ status: "reserved" }), "reserved");
  assert.equal(deriveTableStatusFromLayout({ status: "available" }), "available");
  assert.equal(deriveTableStatusFromLayout({ status: "occupied" }), "occupied");
});

test("deriveTableStatusFromLayout uses persons then reservation", () => {
  assert.equal(
    deriveTableStatusFromLayout({ personsSeated: 2, reservatorName: "Ann" }),
    "occupied",
  );
  assert.equal(
    deriveTableStatusFromLayout({ personsSeated: 0, reservatorName: "Ann" }),
    "reserved",
  );
  assert.equal(
    deriveTableStatusFromLayout({ personsSeated: 0, reservatorName: "  " }),
    "available",
  );
  assert.equal(deriveTableStatusFromLayout({ personsSeated: 0 }), "available");
});
