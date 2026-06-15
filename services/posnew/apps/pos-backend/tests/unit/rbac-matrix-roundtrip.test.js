/* global require */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const defaultRbacRoles = require("../../constants/defaultRbacRoles");
const { PERMISSIONS } = require("../../constants/permissionsCatalog");
const {
  RBAC_MATRIX_ROWS,
  RBAC_MATRIX_ACTIONS,
  expandCanToIdSet,
  idSetToCanArray,
  matrixCellChecked,
  applyMatrixCellToggle,
  matrixCellApplicable,
} = require("../../utils/rbacMatrixProjection");

const catalogIds = PERMISSIONS.filter((p) => p && p.id && p.id !== "*").map((p) => String(p.id));

function assertMatrixConsistentWithSet(label, granted) {
  for (const row of RBAC_MATRIX_ROWS) {
    for (const action of RBAC_MATRIX_ACTIONS) {
      if (!matrixCellApplicable(row, action)) continue;
      const ids = row.actions[action];
      assert.ok(ids);
      const fromHelper = matrixCellChecked(row, action, granted);
      const direct = ids.every((id) => granted.has(id));
      assert.equal(
        fromHelper,
        direct,
        `${label}: row ${row.id} action ${action} helper vs direct mismatch`
      );
    }
  }
}

describe("rbacMatrixProjection", () => {
  it("expands default role cans consistently with matrix cell checks", () => {
    for (const roleKey of ["manager", "waiter", "cashier", "kitchen", "hostess"]) {
      const can = defaultRbacRoles[roleKey]?.can;
      if (!Array.isArray(can)) continue;
      const expanded = expandCanToIdSet(can, catalogIds);
      assertMatrixConsistentWithSet(`role:${roleKey}`, expanded);
    }
  });

  it("round-trips matrix toggles through idSetToCanArray and expandCanToIdSet", () => {
    const baseCan = defaultRbacRoles.waiter?.can ?? [];
    let granted = expandCanToIdSet(baseCan, catalogIds);
    const row = RBAC_MATRIX_ROWS.find((r) => r.id === "orders_scope");
    assert.ok(row);
    applyMatrixCellToggle(row, "view", true, granted);
    const canOut = idSetToCanArray(granted);
    const round = expandCanToIdSet(canOut, catalogIds);
    assert.deepEqual(Array.from(round).sort(), Array.from(granted).sort());
    assert.equal(matrixCellChecked(row, "view", round), true);
  });

  it("toggle off removes only targeted ids when re-expanded", () => {
    const baseCan = defaultRbacRoles.manager?.can ?? [];
    let granted = expandCanToIdSet(baseCan, catalogIds);
    const row = RBAC_MATRIX_ROWS.find((r) => r.id === "tables");
    assert.ok(row);
    assert.equal(matrixCellChecked(row, "view", granted), true);
    applyMatrixCellToggle(row, "view", false, granted);
    const canOut = idSetToCanArray(granted);
    const again = expandCanToIdSet(canOut, catalogIds);
    assert.deepEqual(Array.from(again).sort(), Array.from(granted).sort());
    assert.equal(matrixCellChecked(row, "view", again), false);
  });
});
