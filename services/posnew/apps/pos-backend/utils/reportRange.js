const createHttpError = require("http-errors");

function parseReportQuery(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 7 * 86400000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw createHttpError(400, "Invalid from or to date.");
  }

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const groupBy = ["hour", "day", "week", "month"].includes(query.groupBy)
    ? query.groupBy
    : "day";
  const tz =
    typeof query.tz === "string" && query.tz.length > 0 && query.tz.length < 64
      ? query.tz
      : "UTC";

  return { from, to, groupBy, tz };
}

function dateGroupFormat(groupBy) {
  const map = {
    hour: "%Y-%m-%d %H:00",
    day: "%Y-%m-%d",
    week: "%G-W%V",
    month: "%Y-%m",
  };
  return map[groupBy] || "%Y-%m-%d";
}

module.exports = { parseReportQuery, dateGroupFormat };
