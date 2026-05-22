/**
 * Optional cursor style: ?page=1&limit=20
 * When both are valid positive integers, list handlers can return
 * { success, data, page, limit, total } instead of a bare array in `data`.
 */

function parsePaginationQuery(query, options = {}) {
  const defaultLimit = Math.min(
    Number.parseInt(String(options.defaultLimit || 100), 10) || 100,
    100
  );
  const limitRaw = parseInt(String(query.limit ?? ""), 10);
  const pageRaw = parseInt(String(query.page ?? ""), 10);
  const active =
    Number.isFinite(limitRaw) &&
    limitRaw > 0 &&
    Number.isFinite(pageRaw) &&
    pageRaw > 0;
  if (!active) {
    return { active: false, limit: defaultLimit, page: 1, skip: 0 };
  }
  const limit = Math.min(100, Math.max(1, limitRaw));
  const page = Math.max(1, pageRaw);
  const skip = (page - 1) * limit;
  return { active: true, limit, page, skip };
}

module.exports = { parsePaginationQuery };
