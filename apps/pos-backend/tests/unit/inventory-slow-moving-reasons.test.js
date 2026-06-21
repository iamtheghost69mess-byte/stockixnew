const { test } = require("node:test");
const assert = require("node:assert/strict");
const { REASONS } = require("../../models/stockMovementModel");
const {
  SLOW_MOVING_CONSUMPTION_REASONS,
} = require("../../services/inventoryService");

test("slow-moving consumption reasons are valid StockMovement enum values", () => {
  for (const r of SLOW_MOVING_CONSUMPTION_REASONS) {
    assert.ok(
      REASONS.includes(r),
      `reason "${r}" must exist on stockMovementModel.REASONS`
    );
  }
});
