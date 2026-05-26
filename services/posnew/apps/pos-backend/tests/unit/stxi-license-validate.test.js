"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

const {
  assertLicenseKeyForLocation,
  validateStxi,
} = require("../../services/stxiLicenseValidate");

const SECRET = "test-secret";
const TENANT = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const LOCATION = "507f1f77bcf86cd799439011";

function tenantShortFromId(tenantId) {
  return String(tenantId).replace(/-/g, "").toUpperCase().slice(0, 6);
}

function locationShortFromId(locationId) {
  const raw = String(locationId).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (raw.length <= 6) return raw.padStart(4, "0");
  return raw.slice(-6);
}

function generateStxiKey(tenantId, locationId, secret) {
  const tenantShort = tenantShortFromId(tenantId);
  const locationShort = locationShortFromId(locationId);
  const checksum = createHmac("sha256", secret)
    .update(`${tenantShort}:${locationShort}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  return `STXI-${tenantShort}-${locationShort}-${checksum}`;
}

test("assertLicenseKeyForLocation accepts STXI for matching tenant and location", () => {
  const key = generateStxiKey(TENANT, LOCATION, SECRET);
  const result = assertLicenseKeyForLocation({
    licenseKey: key,
    stockixTenantId: TENANT,
    locationId: LOCATION,
    signingSecret: SECRET,
  });
  assert.equal(result.ok, true);
});

test("assertLicenseKeyForLocation rejects STXI at wrong location", () => {
  const key = generateStxiKey(TENANT, LOCATION, SECRET);
  const result = assertLicenseKeyForLocation({
    licenseKey: key,
    stockixTenantId: TENANT,
    locationId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    signingSecret: SECRET,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "license_key_invalid");
});

test("assertLicenseKeyForLocation requires location for STXI keys", () => {
  const key = generateStxiKey(TENANT, LOCATION, SECRET);
  const result = assertLicenseKeyForLocation({
    licenseKey: key,
    stockixTenantId: TENANT,
    locationId: null,
    signingSecret: SECRET,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "license_key_location_required");
});

test("assertLicenseKeyForLocation rejects deprecated STKX after acceptStkxUntil", () => {
  const past = new Date("2020-01-01T00:00:00.000Z");
  const result = assertLicenseKeyForLocation({
    licenseKey: "STKX-ABCD-EFGH-IJKL",
    signingSecret: SECRET,
    acceptStkxUntil: past,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "license_key_deprecated");
});

test("validateStxi matches shared checksum algorithm", () => {
  const key = generateStxiKey(TENANT, LOCATION, SECRET);
  assert.equal(
    validateStxi(key, {
      stockixTenantId: TENANT,
      locationId: LOCATION,
      secret: SECRET,
    }),
    true,
  );
});
