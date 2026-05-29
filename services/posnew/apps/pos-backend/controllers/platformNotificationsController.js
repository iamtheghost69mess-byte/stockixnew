const PlatformNotification = require("../models/platformNotificationModel");
const mongoose = require("mongoose");

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

/** Synthetic reader for Stockix control-plane `X-Api-Key` proxy (not a PlatformUser row). */
const CONTROL_PLANE_READER_ID = new mongoose.Types.ObjectId(
  "657870000000000000000001",
);

function isControlPlaneApiKey(req) {
  return req.platformAuth?.kind === "api_key";
}

function resolveNotificationReader(req) {
  if (isControlPlaneApiKey(req)) {
    return { kind: "control_plane", id: CONTROL_PLANE_READER_ID };
  }
  const platformUser = req.platformUser;
  if (!platformUser?._id) {
    return null;
  }
  return { kind: "user", id: platformUser._id };
}

function readListLimit(rawLimit) {
  const parsed = Number.parseInt(String(rawLimit || DEFAULT_LIST_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIST_LIMIT;
  }
  return Math.min(parsed, MAX_LIST_LIMIT);
}

const listNotifications = async (req, res, next) => {
  try {
    const limit = readListLimit(req.query.limit);
    const unreadOnly = req.query.unread === "true";

    const reader = resolveNotificationReader(req);
    if (!reader) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const query = {};
    if (unreadOnly) {
      query.readBy = { $ne: reader.id };
    }

    const notifications = await PlatformNotification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
      
    // Add boolean isRead for client convenience
    const formatted = notifications.map((n) => {
      const readArray = n.readBy || [];
      const isRead = readArray.some((uId) => uId.toString() === reader.id.toString());
      return {
        id: String(n._id),
        title: n.title,
        body: n.body,
        severity: n.severity,
        href: n.href,
        createdAt: n.createdAt,
        isRead
      };
    });

    res.json({ success: true, data: formatted });
  } catch (e) {
    next(e);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    const reader = resolveNotificationReader(req);
    if (!reader) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const userId = reader.id;
    
    // Support marking all as read 
    if (id === "all") {
      await PlatformNotification.updateMany(
        { readBy: { $ne: userId } },
        { $addToSet: { readBy: userId } }
      );
      return res.json({ success: true });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const notif = await PlatformNotification.findByIdAndUpdate(
      id,
      { $addToSet: { readBy: userId } },
      { new: true }
    );
    if (!notif) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    res.json({
      success: true,
      data: {
        id: String(notif._id),
        isRead: true,
      },
    });
  } catch (e) {
    next(e);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const reader = resolveNotificationReader(req);
    if (!reader) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const userId = reader.id;
    const count = await PlatformNotification.countDocuments({
      readBy: { $ne: userId }
    });
    res.json({ success: true, count });
  } catch (e) {
    next(e);
  }
};

/** POST /notifications/all/read — same behavior as markAsRead with id "all". */
const markAllNotificationsRead = async (req, res, next) => {
  req.params = { ...req.params, id: "all" };
  return markAsRead(req, res, next);
};

module.exports = {
  listNotifications,
  markAsRead,
  markAllNotificationsRead,
  getUnreadCount,
};
