const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const yaml = require("yaml");

const REQUIRED_PATHS = [
  "/auth/login",
  "/auth/me",
  "/auth/refresh",
  "/organizations",
  "/metrics/summary",
  "/metrics/kpis",
  "/metrics/analytics",
  "/stream",
  "/jobs/{queue}/{id}",
  "/jobs/{queue}/{id}/retry",
  "/openapi.json",
];

const REQUIRED_ORG_LIST_PARAMS = ["limit", "cursor"];
const REQUIRED_ORG_LIST_RESPONSE_PROPS = ["data", "nextCursor"];
const JOB_RETRY_PATH = "/jobs/{queue}/{id}/retry";

test("OpenAPI lists core platform paths", () => {
  const p = path.join(__dirname, "..", "openapi", "platform-v1.yaml");
  const doc = yaml.parse(fs.readFileSync(p, "utf8"));
  for (const route of REQUIRED_PATHS) {
    assert.ok(doc.paths[route], `missing ${route}`);
  }
});

test("OpenAPI documents org list cursor pagination and job retry", () => {
  const p = path.join(__dirname, "..", "openapi", "platform-v1.yaml");
  const doc = yaml.parse(fs.readFileSync(p, "utf8"));
  const getOrgs = doc.paths["/organizations"]?.get;
  assert.ok(getOrgs, "GET /organizations missing");
  const names = (getOrgs.parameters || []).map((x) => x.name);
  for (const q of REQUIRED_ORG_LIST_PARAMS) {
    assert.ok(names.includes(q), `GET /organizations missing query ${q}`);
  }
  const listSchema =
    getOrgs.responses?.["200"]?.content?.["application/json"]?.schema?.$ref;
  assert.equal(listSchema, "#/components/schemas/SuccessOrgList");
  const orgList = doc.components?.schemas?.SuccessOrgList?.allOf?.find(
    (x) => x.properties?.data || x.properties?.nextCursor
  );
  assert.ok(orgList?.properties, "SuccessOrgList schema incomplete");
  for (const prop of REQUIRED_ORG_LIST_RESPONSE_PROPS) {
    assert.ok(
      orgList.properties[prop] !== undefined,
      `SuccessOrgList missing ${prop}`
    );
  }

  assert.ok(doc.paths[JOB_RETRY_PATH]?.post, `missing POST ${JOB_RETRY_PATH}`);
});

test("AJV validates SuccessOrgList-shaped fixture", () => {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const Ajv = require("ajv");
  const ajv = new Ajv({ strict: false });
  const schema = {
    type: "object",
    required: ["success", "data"],
    properties: {
      success: { type: "boolean" },
      data: { type: "array" },
      nextCursor: { type: ["string", "null"] },
    },
  };
  const validate = ajv.compile(schema);
  assert.ok(validate({ success: true, data: [], nextCursor: null }));
  assert.ok(!validate({ success: true, data: "x" }));
});
