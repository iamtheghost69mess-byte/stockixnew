const { posOrgRoom, posOrgLocationRoom } = require("./posSocketRooms");

/** Known server→client POS channel events (extend when adding new emits). */
const POS_SOCKET_EVENTS = new Set([
  "order:updated",
  "order:new",
  "table:status-changed",
  "catalog:updated",
  "inventory:updated",
  "inventory:low-stock",
]);

const POS_SOCKET_MAX_PAYLOAD_BYTES = Math.min(
  4_194_304,
  Math.max(
    4096,
    Number.parseInt(String(process.env.POS_SOCKET_MAX_PAYLOAD_BYTES || "65536"), 10) ||
      65536
  )
);

function assertPosSocketEmitShape(event, payload) {
  if (!POS_SOCKET_EVENTS.has(event)) {
    throw new Error(`emitPos: unknown event ${event}`);
  }
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("emitPos: payload must be a plain object");
  }
  const keys = Object.keys(payload);
  if (keys.length > 40) {
    throw new Error("emitPos: payload has too many keys");
  }
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, "utf8") > POS_SOCKET_MAX_PAYLOAD_BYTES) {
    throw new Error("emitPos: payload exceeds size limit");
  }
}

/** @param {{ location?: unknown } | null | undefined} order */
function posSocketOptsFromOrder(order) {
  const loc = order && order.location;
  if (loc == null || String(loc).trim() === "") return {};
  return { locationId: loc };
}

/** @param {{ location?: unknown } | null | undefined} table */
function posSocketOptsFromTable(table) {
  const loc = table && table.location;
  if (loc == null || String(loc).trim() === "") return {};
  return { locationId: loc };
}

/**
 * Emit a POS realtime event to the tenant organization room (and optionally a location room).
 * @param {import("express").Request} req
 * @param {string} event
 * @param {unknown} payload
 * @param {{
 *   locationId?: import("mongoose").Types.ObjectId | string | null;
 *   organizationId?: import("mongoose").Types.ObjectId | string | null;
 * }} [options]
 */
function emitPos(req, event, payload, options = {}) {
  try {
    assertPosSocketEmitShape(event, payload);
    const orgId =
      options.organizationId != null && String(options.organizationId).trim()
        ? options.organizationId
        : req.tenantOrganizationId;
    if (!orgId) return;
    const io = req.app.get("io");
    if (!io) return;
    const room = posOrgRoom(orgId);
    io.to(room).emit(event, payload);
    const loc = options.locationId;
    if (loc != null && String(loc).trim()) {
      io.to(posOrgLocationRoom(orgId, loc)).emit(event, payload);
    }
  } catch {
    /* no io mounted */
  }
}

module.exports = {
  emitPos,
  posSocketOptsFromOrder,
  posSocketOptsFromTable,
  POS_SOCKET_EVENTS,
  assertPosSocketEmitShape,
};
