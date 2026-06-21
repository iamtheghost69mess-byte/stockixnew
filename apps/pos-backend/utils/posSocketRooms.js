/** Socket.IO room names for POS realtime (tenant-scoped). */

function posOrgRoom(organizationId) {
  return `org:${String(organizationId)}`;
}

function posOrgLocationRoom(organizationId, locationId) {
  return `org:${String(organizationId)}:loc:${String(locationId)}`;
}

module.exports = { posOrgRoom, posOrgLocationRoom };
