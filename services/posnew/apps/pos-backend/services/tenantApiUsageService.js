const TenantApiRequestMetric = require("../models/tenantApiRequestMetricModel");

function toDayUtc(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toStatusFamily(statusCode) {
  const value = Number(statusCode);
  if (!Number.isFinite(value)) return "other";
  const family = Math.trunc(value / 100);
  if (family === 2) return "2xx";
  if (family === 3) return "3xx";
  if (family === 4) return "4xx";
  if (family === 5) return "5xx";
  return "other";
}

function normalizeEndpointKey(endpointKey) {
  const raw = String(endpointKey || "").trim();
  if (!raw) return "unknown";
  if (raw.length <= 120) return raw;
  return raw.slice(0, 120);
}

async function recordTenantApiRequest(input) {
  const organizationId = String(input.organizationId || "").trim();
  if (!organizationId) return;

  const dayUtc = toDayUtc();
  const method = String(input.method || "GET").toUpperCase();
  const endpointKey = normalizeEndpointKey(input.endpointKey);
  const statusFamily = toStatusFamily(input.statusCode);

  await TenantApiRequestMetric.updateOne(
    {
      organization: organizationId,
      dayUtc,
      method,
      endpointKey,
      statusFamily,
    },
    {
      $inc: { count: 1 },
      $set: { lastSeenAt: new Date() },
      $setOnInsert: { organization: organizationId, dayUtc, method, endpointKey, statusFamily },
    },
    { upsert: true }
  );
}

module.exports = {
  normalizeEndpointKey,
  recordTenantApiRequest,
  toStatusFamily,
};
