const { posOrgRoom } = require("../utils/posSocketRooms");

/** @type {import("socket.io").Server | null} */
let ioRef = null;

function setBackofficeNotificationIo(io) {
  ioRef = io || null;
}

function emitBackofficeNotificationUpdated(organizationId, payload = {}) {
  if (!ioRef || !organizationId) return;
  const room = posOrgRoom(organizationId);
  ioRef.to(room).emit("notifications:updated", {
    organizationId: String(organizationId),
    at: new Date().toISOString(),
    ...payload,
  });
}

module.exports = {
  setBackofficeNotificationIo,
  emitBackofficeNotificationUpdated,
};
