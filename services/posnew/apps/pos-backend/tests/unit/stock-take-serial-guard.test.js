const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

/** Mirrors pos-frontend2 stock-take-serial-guard.ts */
function effectiveCountedQty(line, localCounts) {
  const local = localCounts[line._id];
  if (local !== undefined && !Number.isNaN(local)) return local;
  if (line.countedQty !== null && line.countedQty !== undefined) {
    return Number(line.countedQty);
  }
  return null;
}

function serialLinesWithVariance(lines, localCounts) {
  const out = [];
  for (const line of lines) {
    const ing = typeof line.ingredient === "object" ? line.ingredient : null;
    if (!ing?.isSerialTracked) continue;
    const counted = effectiveCountedQty(line, localCounts);
    if (counted === null) continue;
    const system = Number(line.systemQty) || 0;
    if (Math.abs(counted - system) < 1e-9) continue;
    out.push({
      lineId: line._id,
      ingredientId: ing._id,
      ingredientName: ing.name,
    });
  }
  return out;
}

describe("stock take serial guard", () => {
  it("flags serial lines with non-zero variance", () => {
    const lines = [
      {
        _id: "line-1",
        systemQty: 5,
        countedQty: 4,
        ingredient: { _id: "ing-1", name: "Widget", isSerialTracked: true },
      },
      {
        _id: "line-2",
        systemQty: 2,
        countedQty: 2,
        ingredient: { _id: "ing-2", name: "Bolt", isSerialTracked: true },
      },
    ];
    const flagged = serialLinesWithVariance(lines, {});
    assert.equal(flagged.length, 1);
    assert.equal(flagged[0].ingredientName, "Widget");
  });

  it("uses local count buffer when present", () => {
    const lines = [
      {
        _id: "line-1",
        systemQty: 5,
        countedQty: 5,
        ingredient: { _id: "ing-1", name: "Widget", isSerialTracked: true },
      },
    ];
    const flagged = serialLinesWithVariance(lines, { "line-1": 3 });
    assert.equal(flagged.length, 1);
  });
});
