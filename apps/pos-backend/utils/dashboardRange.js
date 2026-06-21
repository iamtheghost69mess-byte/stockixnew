const createHttpError = require("http-errors");

/**
 * @param {Record<string, unknown>} [query]
 * @returns {{
 *   from: Date;
 *   to: Date;
 *   prevFrom: Date;
 *   prevTo: Date;
 *   tz: string;
 *   range: "7d" | "30d" | "90d";
 *   groupBy: "day";
 *   nDays: number;
 * }}
 */
function parseDashboardRange(query = {}) {
  const tz =
    typeof query.tz === "string" && query.tz.length > 0 && query.tz.length < 64
      ? query.tz
      : "UTC";
  const rawRange = query.range;
  const r =
    typeof rawRange === "string" && rawRange.length > 0
      ? rawRange
      : "90d";
  const range = ["7d", "30d", "90d"].includes(r) ? r : "90d";
  let nDays = 90;
  if (range === "7d") nDays = 7;
  else if (range === "30d") nDays = 30;

  const to = new Date();
  const from = new Date(to.getTime() - (nDays - 1) * 86400000);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const prevTo = new Date(from.getTime() - 1);
  prevTo.setHours(23, 59, 59, 999);
  const prevFrom = new Date(prevTo.getTime() - (nDays - 1) * 86400000);
  prevFrom.setHours(0, 0, 0, 0);

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    Number.isNaN(prevFrom.getTime()) ||
    Number.isNaN(prevTo.getTime())
  ) {
    throw createHttpError(400, "Invalid dashboard date range.");
  }

  return { from, to, prevFrom, prevTo, tz, range, groupBy: "day", nDays };
}

/**
 * Calendar steps from `from`..`to` (inclusive), labeled in IANA `tz` (YYYY-MM-DD).
 * Uses local noon on each step to reduce DST edge issues when paired with Mongo `$dateToString`.
 *
 * @param {Date} from
 * @param {Date} to
 * @param {string} tz
 * @returns {string[]}
 */
function listDashboardDayKeys(from, to, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const out = [];
  const startDay = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    12,
    0,
    0,
    0
  );
  const endDay = new Date(
    to.getFullYear(),
    to.getMonth(),
    to.getDate(),
    12,
    0,
    0,
    0
  );
  const spanDays =
    Math.floor((endDay.getTime() - startDay.getTime()) / 86400000) + 1;
  for (let i = 0; i < spanDays; i++) {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    out.push(fmt.format(d));
  }
  return out;
}

/**
 * @param {Date|string|number} when
 * @param {string} tz
 * @returns {string}
 */
function ymdInTz(when, tz) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(when));
}

module.exports = { parseDashboardRange, listDashboardDayKeys, ymdInTz };
