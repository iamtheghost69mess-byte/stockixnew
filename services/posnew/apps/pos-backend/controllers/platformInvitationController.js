const createHttpError = require("http-errors");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const OrgInvitation = require("../models/orgInvitationModel");
const { addJob } = require("../services/jobQueue");
const { writeAudit, auditFromRequest } = require("../services/platformAuditService");
 
/** List all invitations across the platform with enterprise-grade filtering and pagination. */
const listInvitations = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter = {};
    if (q) {
      filter.$or = [
        { email: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        { roleHint: q }
      ];
    }
    
    // Support filtering by organization if passed
    if (req.query.organizationId) {
      filter.organization = req.query.organizationId;
    }
 
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const cursor = String(req.query.cursor || "").trim();
    if (cursor) {
      try {
        const idPart = Buffer.from(cursor, "base64url").toString("utf8");
        filter._id = { $lt: idPart };
      } catch { /* ignore */ }
    }
 
    const rows = await OrgInvitation.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate("organization", "name slug")
      .lean();
 
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && data.length 
      ? Buffer.from(String(data[data.length - 1]._id)).toString("base64url") 
      : null;
 
    res.json({ success: true, data, nextCursor });
  } catch (e) {
    next(e);
  }
};
 
const createInvitation = async (req, res, next) => {
  try {
    const { organizationId, email, roleHint } = req.body || {};
    if (!organizationId || !email) {
      return next(createHttpError(400, "organizationId and email required."));
    }
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(token, 10);
    const inv = await OrgInvitation.create({
      organization: organizationId,
      email: String(email).trim().toLowerCase(),
      roleHint: roleHint || "waiter",
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    });
    await addJob("email", "org_invitation", {
      invitationId: String(inv._id),
      tokenPlain: token,
    });
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.invitation.create",
      organization: organizationId,
      metadata: { email: inv.email },
    });
    res.status(201).json({
      success: true,
      data: {
        id: inv._id,
        email: inv.email,
        expiresAt: inv.expiresAt,
        token,
      },
    });
  } catch (e) {
    next(e);
  }
};
 
module.exports = { createInvitation, listInvitations };
