const Table = require("../models/tableModel");

/**
 * Table IDs visible for a location scope (includes legacy tables with no location).
 * @returns {Promise<ObjectId[]|null>} null = no filter (all tables)
 */
async function tableIdsForOrderFilter(scopeId) {
  if (!scopeId) return null;
  const ids = await Table.find({
    $or: [
      { location: scopeId },
      { location: null },
      { location: { $exists: false } },
    ],
  }).distinct("_id");
  return ids;
}

function locationMatchForOrders(scopeId) {
  if (!scopeId) return null;
  return {
    $or: [
      { location: scopeId },
      { location: null },
      { location: { $exists: false } },
    ],
  };
}

module.exports = { tableIdsForOrderFilter, locationMatchForOrders };
