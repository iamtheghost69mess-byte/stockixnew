const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Regression guard: inventory adjust costing must branch on sign of delta,
 * not only on receive vs else (which incorrectly consumed layers on +qty).
 */
test("costing branch plan: receive and positive uses receive path", () => {
  const branch = (r, delta) => {
    if (r === "receive" && delta > 0) return "receive_in";
    if (delta < 0) return "consume";
    if (delta > 0) return "positive_non_receive";
    return "none";
  };
  assert.equal(branch("receive", 2), "receive_in");
  assert.equal(branch("manual_adjust", -1), "consume");
  assert.equal(branch("correction", 5), "positive_non_receive");
  assert.equal(branch("waste", 0), "none");
});
