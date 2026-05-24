const createHttpError = require("http-errors");
const config = require("../config/config");
const User = require("../models/userModel");
const Organization = require("../models/organizationModel");
const { signImpersonationAccessToken } = require("../utils/authTokens");
const { writeAudit, auditFromRequest } = require("../services/platformAuditService");

const createSession = async (req, res, next) => {
  try {
    if (!config.impersonationEnabled) {
      return next(createHttpError(403, "Impersonation disabled."));
    }
    const { userId, organizationId } = req.body || {};
    let targetUser = null;
    let targetOrgId = null;

    if (userId) {
      targetUser = await User.findById(userId);
      if (!targetUser?.organization) {
        return next(createHttpError(400, "User must belong to an organization."));
      }
      targetOrgId = targetUser.organization._id || targetUser.organization;
    } else if (organizationId) {
      targetUser = await User.findOne({ 
        organization: organizationId, 
        role: "admin" 
      }).sort({ createdAt: 1 });
      if (!targetUser) {
        return next(createHttpError(404, "No admin user found for this organization."));
      }
      targetOrgId = organizationId;
    } else {
      return next(createHttpError(400, "userId or organizationId required."));
    }

    const org = await Organization.findById(targetOrgId);
    if (!org) return next(createHttpError(404, "Organization not found."));

    const accessToken = signImpersonationAccessToken(
      targetUser._id,
      targetOrgId,
      req.platformUser._id
    );

    // Construct redirect URL
    // e.g. http://tenant.stockix.local/auth/impersonate?token=...
    const baseUrl = config.tenantAppOrigin.replace(/\/$/, "");
    const redirectUrl = `${baseUrl}/auth/impersonate?token=${accessToken}`;
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.impersonation.start",
      organization: targetOrgId,
      actorPlatformUser: req.platformUser._id,
      metadata: { targetUserId: String(targetUser._id) },
    });
    res.json({
      success: true,
      data: {
        accessToken,
        redirectUrl,
        banner: {
          kind: "platform_impersonation",
          platformUserId: String(req.platformUser._id),
          ttlSeconds: 900,
        },
      },
    });
  } catch (e) {
    next(e);
  }
};

module.exports = { createSession };
