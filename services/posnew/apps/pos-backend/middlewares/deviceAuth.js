const createHttpError = require("http-errors");
const { randomUUID } = require("crypto");
const Device = require("../models/deviceModel");
const User = require("../models/userModel");
const config = require("../config/config");
const { computePinLookup } = require("../utils/pinLookup");
const { posOrgRoom } = require("../utils/posSocketRooms");
const { writeAudit } = require("../services/platformAuditService");
const {
  NOTIFICATION_EVENTS,
  createBackofficeNotificationFromEvent,
} = require("../services/backofficeNotificationEvents");

const DEVICE_COOKIE_NAME = "device_uuid";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function deviceCookieOptions() {
  if (config.posDevCrossSiteCookies) {
    return {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: ONE_YEAR_MS,
      path: "/",
    };
  }
  return {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: config.nodeEnv === "production" ? "none" : "lax",
    maxAge: ONE_YEAR_MS,
    path: "/",
  };
}

async function resolveOrganizationIdFromPin(pin) {
  if (!pin || !/^\d{4,6}$/.test(String(pin))) {
    return null;
  }
  const pinLookup = computePinLookup(pin);
  const foundUser = await User.findOne({ pinLookup }).select("organization").lean();
  return foundUser?.organization ? String(foundUser.organization) : null;
}

async function resolveOrganizationIdForRequest(req) {
  if (req.subdomainOrg?._id) {
    return String(req.subdomainOrg._id);
  }
  return resolveOrganizationIdFromPin(req.body?.pin);
}

function emitPendingDevice(req, payload) {
  const io = req.app?.get("io");
  if (!io) return;
  io.to(posOrgRoom(payload.organizationId)).emit("device:new_pending", payload);
}

async function createPendingDevice(req, res, organizationId, uuid) {
  const createdAt = new Date();
  const nextUuid = uuid || randomUUID();
  let device = null;
  try {
    device = await Device.create({
      uuid: nextUuid,
      organization: organizationId,
      status: "pending",
      createdAt,
      lastSeenAt: createdAt,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      device = await Device.findOne({
        uuid: nextUuid,
        organization: organizationId,
      });
      if (!device) {
        const conflictError = createHttpError(
          403,
          "This device has been revoked. Please contact your manager."
        );
        conflictError.code = "DEVICE_REVOKED";
        throw conflictError;
      }
    } else {
      throw error;
    }
  }

  res.cookie(DEVICE_COOKIE_NAME, nextUuid, deviceCookieOptions());

  if (device) {
    await writeAudit({
      action: "device.new_pending",
      actorType: "system",
      organization: device.organization,
      metadata: {
        deviceId: String(device._id),
        uuid: device.uuid,
      },
    });
    emitPendingDevice(req, {
      deviceId: String(device._id),
      uuid: device.uuid,
      createdAt: device.createdAt,
      organizationId: String(device.organization),
    });
    await createBackofficeNotificationFromEvent(
      NOTIFICATION_EVENTS.DEVICE_NEW_PENDING,
      {
        organizationId: String(device.organization),
        deviceId: String(device._id),
        uuid: device.uuid,
      },
    );
  }

  const error = createHttpError(
    403,
    "This device is not authorized. Please contact your manager."
  );
  error.code = "DEVICE_PENDING";
  throw error;
}

async function enforceApprovedDeviceForOrganization(req, res, organizationId) {
  if (!organizationId) return null;
  const cookieUuid = String(req.cookies?.[DEVICE_COOKIE_NAME] || "").trim();
  if (!cookieUuid) {
    await createPendingDevice(req, res, organizationId, null);
    return null;
  }
  const device = await Device.findOne({
    uuid: cookieUuid,
    organization: organizationId,
  });
  if (!device) {
    await createPendingDevice(req, res, organizationId, cookieUuid);
    return null;
  }
  device.lastSeenAt = new Date();
  await device.save();
  if (device.status !== "approved") {
    const error = createHttpError(
      403,
      "This device is not authorized. Please contact your manager."
    );
    error.code = "DEVICE_PENDING";
    throw error;
  }
  return device;
}

async function deviceAuth(req, res, next) {
  try {
    const organizationId = await resolveOrganizationIdForRequest(req);
    if (!organizationId) return next();
    const device = await enforceApprovedDeviceForOrganization(
      req,
      res,
      organizationId
    );
    req.device = device;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  deviceAuth,
  DEVICE_COOKIE_NAME,
  enforceApprovedDeviceForOrganization,
};
