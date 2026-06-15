const mongoose = require("mongoose");
const InventoryAuditEvent = require("../models/inventoryAuditEventModel");

/**
 * Persist an inventory audit event (insert-only).
 * @param {object} params
 * @param {import("mongoose").Types.ObjectId|string} params.organizationId
 * @param {string} params.action
 * @param {string} [params.sourceType]
 * @param {import("mongoose").Types.ObjectId|string|null} [params.sourceId]
 * @param {import("mongoose").Types.ObjectId|string|null} [params.actorId]
 * @param {Record<string, unknown>|null} [params.metadata]
 * @param {import("mongoose").ClientSession|null} [params.session]
 * @returns {Promise<import("mongoose").Document|null>}
 */
async function recordInventoryAudit(params) {
  const {
    organizationId,
    action,
    sourceType = "",
    sourceId = null,
    actorId = null,
    metadata = null,
    session = null,
  } = params;
  if (!organizationId || !action) {
    return null;
  }
  const row = {
    organization: organizationId,
    action: String(action).slice(0, 128),
    sourceType: sourceType != null ? String(sourceType).slice(0, 64) : "",
    sourceId:
      sourceId && mongoose.Types.ObjectId.isValid(String(sourceId))
        ? new mongoose.Types.ObjectId(String(sourceId))
        : null,
    actor:
      actorId && mongoose.Types.ObjectId.isValid(String(actorId))
        ? new mongoose.Types.ObjectId(String(actorId))
        : null,
    metadata: metadata && typeof metadata === "object" ? metadata : null,
  };
  const created = await InventoryAuditEvent.create([row], session ? { session } : {});
  return created[0] || null;
}

module.exports = { recordInventoryAudit };
