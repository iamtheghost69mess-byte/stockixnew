const { test } = require("node:test");
const assert = require("node:assert/strict");

const { trackRouteRequest, snapshotRouteMetrics } = require("../../services/observability");

test("trackRouteRequest captures RED metrics for routes", () => {
  trackRouteRequest({
    method: "GET",
    routePattern: "/api/table",
    statusCode: 200,
    durationMs: 45,
  });
  trackRouteRequest({
    method: "GET",
    routePattern: "/api/table",
    statusCode: 503,
    durationMs: 90,
  });
  const rows = snapshotRouteMetrics();
  const tableMetric = rows.find((row) => row.route === "GET /api/table");
  assert.ok(tableMetric);
  assert.equal(tableMetric.requests >= 2, true);
  assert.equal(tableMetric.errors >= 1, true);
  assert.equal(tableMetric.maxDurationMs >= 90, true);
});
