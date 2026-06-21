/**
 * Compatibility export: operational audit trail is stored as `PosAuditLog`.
 * Import this module when integrations expect `models/auditLogModel`.
 */
module.exports = require("./posAuditLogModel");
