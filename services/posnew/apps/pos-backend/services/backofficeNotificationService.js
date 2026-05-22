const mongoose = require("mongoose");
const BackofficeNotification = require("../models/backofficeNotificationModel");
const {
  emitBackofficeNotificationUpdated,
} = require("./backofficeNotificationRealtime");

function normalizeSeverity(value) {
  const normalized = String(value || "info").toLowerCase().trim();
  if (normalized === "critical" || normalized === "warning") return normalized;
  return "info";
}

function normalizeLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return 30;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

function toObjectIdOrNull(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

function compactText(value, maxLength = 240) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
}

function normalizeDedupeWindowMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Math.floor(n)));
}

function fallbackDedupeKey(input) {
  return [
    compactText(input.type || "system", 64),
    normalizeSeverity(input.severity),
    compactText(input.sourceType || "", 64),
    compactText(input.sourceId || "", 100),
    compactText(input.title || "", 140),
  ]
    .filter(Boolean)
    .join("|");
}

function toNotificationDto(doc, userObjectId) {
  const row = doc?.toObject ? doc.toObject() : doc;
  const readBy = Array.isArray(row.readBy) ? row.readBy : [];
  const isRead = userObjectId
    ? readBy.some((entry) => String(entry) === String(userObjectId))
    : false;
  return {
    _id: String(row._id),
    type: String(row.type || ""),
    title: String(row.title || ""),
    body: String(row.body || ""),
    severity: normalizeSeverity(row.severity),
    sourceType: String(row.sourceType || ""),
    sourceId: String(row.sourceId || ""),
    href: String(row.href || ""),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    isArchived: Boolean(row.isArchived),
    isRead,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function createNotification(input) {
  const organizationObjectId = toObjectIdOrNull(input.organizationId);
  if (!organizationObjectId) throw new Error("organizationId is required");
  const title = compactText(input.title, 140);
  if (!title) throw new Error("title is required");
  const body = compactText(input.body, 400);
  const dedupeWindowMs = normalizeDedupeWindowMs(input.dedupeWindowMs);
  const dedupeKey = compactText(input.dedupeKey || fallbackDedupeKey(input), 200);
  if (dedupeWindowMs > 0 && dedupeKey) {
    const threshold = new Date(Date.now() - dedupeWindowMs);
    const existing = await BackofficeNotification.findOne({
      organization: organizationObjectId,
      isArchived: false,
      dedupeKey,
      createdAt: { $gte: threshold },
    }).sort({ createdAt: -1 });
    if (existing) return existing;
  }
  const doc = await BackofficeNotification.create({
    organization: organizationObjectId,
    type: compactText(input.type || "system", 64),
    title,
    body,
    severity: normalizeSeverity(input.severity),
    sourceType: compactText(input.sourceType || "", 64),
    sourceId: compactText(input.sourceId || "", 100),
    dedupeKey,
    href: compactText(input.href || "", 300),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  });
  emitBackofficeNotificationUpdated(organizationObjectId, {
    action: "created",
    notificationId: String(doc._id),
  });
  return doc;
}

async function listNotifications({
  organizationId,
  userId,
  limit,
  severity,
  status,
}) {
  const organizationObjectId = toObjectIdOrNull(organizationId);
  if (!organizationObjectId) throw new Error("organizationId is required");
  const userObjectId = toObjectIdOrNull(userId);
  const query = {
    organization: organizationObjectId,
    isArchived: false,
  };
  if (severity && severity !== "all") {
    query.severity = normalizeSeverity(severity);
  }
  if (status === "unread" && userObjectId) {
    query.readBy = { $ne: userObjectId };
  } else if (status === "read" && userObjectId) {
    query.readBy = userObjectId;
  }

  const rows = await BackofficeNotification.find(query)
    .sort({ createdAt: -1 })
    .limit(normalizeLimit(limit))
    .lean();

  return rows.map((row) => toNotificationDto(row, userObjectId));
}

async function unreadCount({ organizationId, userId }) {
  const organizationObjectId = toObjectIdOrNull(organizationId);
  const userObjectId = toObjectIdOrNull(userId);
  if (!organizationObjectId || !userObjectId) return 0;
  return BackofficeNotification.countDocuments({
    organization: organizationObjectId,
    isArchived: false,
    readBy: { $ne: userObjectId },
  });
}

async function markRead({ organizationId, notificationId, userId }) {
  const organizationObjectId = toObjectIdOrNull(organizationId);
  const notificationObjectId = toObjectIdOrNull(notificationId);
  const userObjectId = toObjectIdOrNull(userId);
  if (!organizationObjectId || !notificationObjectId || !userObjectId) return null;
  const doc = await BackofficeNotification.findOneAndUpdate(
    { _id: notificationObjectId, organization: organizationObjectId },
    { $addToSet: { readBy: userObjectId } },
    { new: true },
  );
  if (doc) {
    emitBackofficeNotificationUpdated(organizationObjectId, {
      action: "read",
      notificationId: String(doc._id),
      userId: String(userObjectId),
    });
  }
  return doc ? toNotificationDto(doc, userObjectId) : null;
}

async function markAllRead({ organizationId, userId }) {
  const organizationObjectId = toObjectIdOrNull(organizationId);
  const userObjectId = toObjectIdOrNull(userId);
  if (!organizationObjectId || !userObjectId) return { modifiedCount: 0 };
  const result = await BackofficeNotification.updateMany(
    { organization: organizationObjectId, isArchived: false, readBy: { $ne: userObjectId } },
    { $addToSet: { readBy: userObjectId } },
  );
  const modifiedCount = Number(result.modifiedCount || 0);
  if (modifiedCount > 0) {
    emitBackofficeNotificationUpdated(organizationObjectId, {
      action: "read_all",
      userId: String(userObjectId),
      modifiedCount,
    });
  }
  return { modifiedCount };
}

module.exports = {
  createNotification,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
};
