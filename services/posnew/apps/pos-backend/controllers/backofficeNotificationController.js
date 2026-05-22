const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const backofficeNotificationService = require("../services/backofficeNotificationService");
const { assertTenantOrganization } = require("../utils/tenantOrg");

function readUserId(req) {
  return req.user?._id || null;
}

const listBackofficeNotifications = async (req, res, next) => {
  try {
    const organizationId = assertTenantOrganization(req);
    const userId = readUserId(req);
    const { limit, severity, status } = req.query || {};
    const data = await backofficeNotificationService.listNotifications({
      organizationId,
      userId,
      limit,
      severity,
      status,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getBackofficeUnreadNotificationCount = async (req, res, next) => {
  try {
    const organizationId = assertTenantOrganization(req);
    const userId = readUserId(req);
    const count = await backofficeNotificationService.unreadCount({
      organizationId,
      userId,
    });
    res.status(200).json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    next(error);
  }
};

const markBackofficeNotificationRead = async (req, res, next) => {
  try {
    const organizationId = assertTenantOrganization(req);
    const userId = readUserId(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid notification id"));
    }
    const doc = await backofficeNotificationService.markRead({
      organizationId,
      notificationId: id,
      userId,
    });
    if (!doc) {
      return next(createHttpError(404, "Notification not found"));
    }
    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    next(error);
  }
};

const markAllBackofficeNotificationsRead = async (req, res, next) => {
  try {
    const organizationId = assertTenantOrganization(req);
    const userId = readUserId(req);
    const out = await backofficeNotificationService.markAllRead({
      organizationId,
      userId,
    });
    res.status(200).json({ success: true, data: out });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listBackofficeNotifications,
  getBackofficeUnreadNotificationCount,
  markBackofficeNotificationRead,
  markAllBackofficeNotificationsRead,
};
