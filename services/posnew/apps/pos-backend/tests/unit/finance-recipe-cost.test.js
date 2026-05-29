const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { computeMenuLineUnitCost } = require("../../services/financeRecipeCost");

test("computeMenuLineUnitCost returns null for non-stockable menu items", async () => {
  const MenuItem = require("../../models/menuItemModel");
  const origFind = MenuItem.findById;
  MenuItem.findById = () => ({
    select: () => ({
      lean: async () => ({ inventoryImpact: "service" }),
    }),
  });
  try {
    const cost = await computeMenuLineUnitCost(
      new mongoose.Types.ObjectId(),
      1,
      null,
      String(new mongoose.Types.ObjectId())
    );
    assert.equal(cost, null);
  } finally {
    MenuItem.findById = origFind;
  }
});
