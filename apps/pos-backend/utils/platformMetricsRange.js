const createHttpError = require("http-errors");

const MAX_RANGE_MS = 366 * 86400000;

/**
 * Parse optional `from` / `to` (or `since` / `until`) for platform metrics.
 * Accepts `YYYY-MM-DD` (UTC day bounds) or full ISO datetimes.
 * @returns {{ since: Date, until: Date } | null}
 */
function parseOptionalMetricsRange(query) {
  const rawFrom = query.from ?? query.since;
  const rawTo = query.to ?? query.until;
  if (rawFrom == null || rawTo == null || String(rawFrom).trim() === "" || String(rawTo).trim() === "") {
    return null;
  }
  const s = String(rawFrom).trim();
  const e = String(rawTo).trim();
  const since = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(`${s}T00:00:00.000Z`)
    : new Date(s);
  const until = /^\d{4}-\d{2}-\d{2}$/.test(e)
    ? new Date(`${e}T23:59:59.999Z`)
    : new Date(e);
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
    throw createHttpError(400, "Invalid from/to (or since/until) date.");
  }
  if (until < since) {
    throw createHttpError(400, "End date must be on or after start date.");
  }
  if (until.getTime() - since.getTime() > MAX_RANGE_MS) {
    throw createHttpError(400, "Date range cannot exceed 366 days.");
  }
  return { since, until };
}

function rangeDaysInclusive(since, until) {
  const ms = Math.max(0, until.getTime() - since.getTime());
  return Math.max(1, Math.ceil(ms / 86400000));
}

module.exports = { parseOptionalMetricsRange, rangeDaysInclusive, MAX_RANGE_MS };
