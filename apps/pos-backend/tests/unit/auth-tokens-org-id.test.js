/**
 * @import { test } from "node:test"
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  extractOrganizationIdForJwtPayload,
} = require("../../utils/authTokens");

test("extractOrganizationIdForJwtPayload handles populated organization", () => {
  const oid = new mongoose.Types.ObjectId();
  assert.equal(
    String(extractOrganizationIdForJwtPayload({ _id: oid, name: "X" })),
    String(oid)
  );
});

test("extractOrganizationIdForJwtPayload handles raw ObjectId", () => {
  const oid = new mongoose.Types.ObjectId();
  assert.equal(String(extractOrganizationIdForJwtPayload(oid)), String(oid));
});

test("extractOrganizationIdForJwtPayload returns undefined for null", () => {
  assert.equal(extractOrganizationIdForJwtPayload(null), undefined);
  assert.equal(extractOrganizationIdForJwtPayload(""), undefined);
});
