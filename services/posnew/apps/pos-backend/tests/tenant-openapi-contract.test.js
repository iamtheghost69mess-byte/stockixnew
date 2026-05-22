const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const yaml = require("yaml");

const REQUIRED_PATHS = [
  "/api/auth/login",
  "/api/orders/",
  "/api/orders/{id}",
  "/api/rbac/me",
  "/api/accounting/journal-entries",
  "/api/public/menu",
];

test("Tenant OpenAPI lists core POS paths", () => {
  const p = path.join(__dirname, "..", "openapi", "tenant-pos-v1.yaml");
  const doc = yaml.parse(fs.readFileSync(p, "utf8"));
  for (const route of REQUIRED_PATHS) {
    assert.ok(doc.paths[route], `missing ${route}`);
  }
});

test("Tenant OpenAPI defines PosBearer security", () => {
  const p = path.join(__dirname, "..", "openapi", "tenant-pos-v1.yaml");
  const doc = yaml.parse(fs.readFileSync(p, "utf8"));
  assert.ok(doc.components?.securitySchemes?.PosBearer);
});
