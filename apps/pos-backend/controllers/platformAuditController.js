const mongoose = require("mongoose");
const PlatformAuditLog = require("../models/platformAuditLogModel");

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const listAudits = async (req, res, next) => {
  try {
    const {
      organizationId: org,
      action,
      userId,
      from,
      to,
      limit: limitRaw,
    } = req.query;
    const filter = {};
    if (org) filter.organization = org;
    if (action && String(action).trim()) {
      filter.action = new RegExp(escapeRegex(String(action).trim()), "i");
    }
    if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
      filter.actorPlatformUser = userId;
    }
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(String(from));
      if (to) filter.createdAt.$lte = new Date(String(to));
    }
    const limit = Math.min(
      200,
      Math.max(1, Number.parseInt(String(limitRaw || "50"), 10) || 50)
    );
    const rows = await PlatformAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

module.exports = { listAudits };
