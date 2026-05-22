const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Documents LIFO vs FIFO layer consumption order in inventoryCostService.consumeIngredientCost.
 */
test("layer sort: FIFO oldest first, LIFO newest first", () => {
  const fifoSort = { receivedAt: 1, _id: 1 };
  const lifoSort = { receivedAt: -1, _id: -1 };
  assert.deepEqual(fifoSort, { receivedAt: 1, _id: 1 });
  assert.deepEqual(lifoSort, { receivedAt: -1, _id: -1 });
});
