const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  resolveRevenueAccountIdFromCategoryMap,
  menuCategoryPathFromMap,
} = require("../../services/categoryRevenueResolveService");

test("resolveRevenueAccountIdFromCategoryMap uses leaf revenueAccount first", () => {
  const leaf = new mongoose.Types.ObjectId();
  const revLeaf = new mongoose.Types.ObjectId();
  const revParent = new mongoose.Types.ObjectId();
  const parent = new mongoose.Types.ObjectId();
  const byId = new Map([
    [String(leaf), { _id: leaf, parentCategory: parent, revenueAccount: revLeaf }],
    [String(parent), { _id: parent, parentCategory: null, revenueAccount: revParent }],
  ]);
  assert.equal(resolveRevenueAccountIdFromCategoryMap(String(leaf), byId), String(revLeaf));
});

test("resolveRevenueAccountIdFromCategoryMap inherits from parent when leaf has none", () => {
  const leaf = new mongoose.Types.ObjectId();
  const revParent = new mongoose.Types.ObjectId();
  const parent = new mongoose.Types.ObjectId();
  const byId = new Map([
    [String(leaf), { _id: leaf, parentCategory: parent, revenueAccount: null }],
    [String(parent), { _id: parent, parentCategory: null, revenueAccount: revParent }],
  ]);
  assert.equal(resolveRevenueAccountIdFromCategoryMap(String(leaf), byId), String(revParent));
});

test("resolveRevenueAccountIdFromCategoryMap returns null when chain has no revenue", () => {
  const leaf = new mongoose.Types.ObjectId();
  const parent = new mongoose.Types.ObjectId();
  const byId = new Map([
    [String(leaf), { _id: leaf, parentCategory: parent, revenueAccount: null }],
    [String(parent), { _id: parent, parentCategory: null, revenueAccount: null }],
  ]);
  assert.equal(resolveRevenueAccountIdFromCategoryMap(String(leaf), byId), null);
});

test("resolveRevenueAccountIdFromCategoryMap stops on missing parent link", () => {
  const leaf = new mongoose.Types.ObjectId();
  const byId = new Map([[String(leaf), { _id: leaf, parentCategory: new mongoose.Types.ObjectId(), revenueAccount: null }]]);
  assert.equal(resolveRevenueAccountIdFromCategoryMap(String(leaf), byId), null);
});

test("menuCategoryPathFromMap joins root to leaf", () => {
  const root = new mongoose.Types.ObjectId();
  const mid = new mongoose.Types.ObjectId();
  const leaf = new mongoose.Types.ObjectId();
  const byId = new Map([
    [String(leaf), { name: "Burger", parentCategory: mid }],
    [String(mid), { name: "Mains", parentCategory: root }],
    [String(root), { name: "Food", parentCategory: null }],
  ]);
  assert.equal(menuCategoryPathFromMap(String(leaf), byId), "Food › Mains › Burger");
});

test("menuCategoryPathFromMap returns single segment for root-only leaf", () => {
  const leaf = new mongoose.Types.ObjectId();
  const byId = new Map([[String(leaf), { name: "Drinks", parentCategory: null }]]);
  assert.equal(menuCategoryPathFromMap(String(leaf), byId), "Drinks");
});
