const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { buildOrderSaleRevenueCategoryMix } = require("../../services/accountingService");

test("buildOrderSaleRevenueCategoryMix splits credit by extension weight across leaves", () => {
  const a = new mongoose.Types.ObjectId().toString();
  const b = new mongoose.Types.ObjectId().toString();
  const c = new mongoose.Types.ObjectId().toString();
  const rows = [
    {
      ext: 12,
      menuCategoryLeafId: a,
      menuCategoryPath: "Food › Burgers",
      menuCategoryLeafName: "Burgers",
    },
    {
      ext: 4,
      menuCategoryLeafId: b,
      menuCategoryPath: "Food › Sides",
      menuCategoryLeafName: "Sides",
    },
    {
      ext: 3,
      menuCategoryLeafId: c,
      menuCategoryPath: "Food › Drinks",
      menuCategoryLeafName: "Drinks",
    },
  ];
  const { mix, primary } = buildOrderSaleRevenueCategoryMix(19, rows);
  assert.equal(mix.length, 3);
  const sumAlloc = mix.reduce((s, m) => s + m.allocatedSubtotal, 0);
  assert.equal(sumAlloc, 19);
  assert.equal(mix[0].menuCategoryId, a);
  assert.equal(mix[0].extensionWeight, 12);
  assert.equal(mix[0].pctOfBucketExtension, 63.16);
  assert.equal(primary.menuCategoryId, a);
});

test("buildOrderSaleRevenueCategoryMix prefers largest categorized leaf for primary when uncategorized leads", () => {
  const leaf = new mongoose.Types.ObjectId().toString();
  const rows = [
    { ext: 10, menuCategoryLeafId: null, menuCategoryPath: "", menuCategoryLeafName: "" },
    { ext: 5, menuCategoryLeafId: leaf, menuCategoryPath: "X", menuCategoryLeafName: "Y" },
  ];
  const { mix, primary } = buildOrderSaleRevenueCategoryMix(15, rows);
  assert.equal(mix.length, 2);
  assert.equal(mix[0].menuCategoryId, null);
  assert.equal(primary.menuCategoryId, leaf);
});

test("buildOrderSaleRevenueCategoryMix returns empty for no rows", () => {
  const { mix, primary } = buildOrderSaleRevenueCategoryMix(10, []);
  assert.equal(mix.length, 0);
  assert.deepEqual(primary, {});
});
