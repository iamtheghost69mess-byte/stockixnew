const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Device = require("../models/deviceModel");

function assertObjectId(id, label) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw createHttpError(400, `Invalid ${label}.`);
  }
}

function assertTenantOrganizationId(req) {
  const organizationId = req.tenantOrganizationId;
  if (!organizationId) {
    throw createHttpError(403, "Organization is required.");
  }
  return organizationId;
}

async function listDevices(req, res, next) {
  try {
    const organizationId = assertTenantOrganizationId(req);
    const devices = await Device.find({ organization: organizationId })
      .sort({ createdAt: -1 })
      .select("uuid nickname status createdAt lastSeenAt organization")
      .lean();
    res.status(200).json({ success: true, data: devices });
  } catch (error) {
    next(error);
  }
}

async function updateDeviceStatus(req, res, status, message, next) {
  try {
    const organizationId = assertTenantOrganizationId(req);
    const { id } = req.params;
    assertObjectId(id, "device id");
    const current = await Device.findOne({ _id: id, organization: organizationId })
      .select("status")
      .lean();
    if (!current) {
      throw createHttpError(404, "Device not found.");
    }
    if (current.status !== "pending") {
      throw createHttpError(
        409,
        "Device decision is final. Only pending devices can be approved or rejected."
      );
    }
    const device = await Device.findOneAndUpdate(
      { _id: id, organization: organizationId },
      { $set: { status } },
      { new: true }
    )
      .select("uuid nickname status createdAt lastSeenAt organization")
      .lean();
    if (!device) {
      throw createHttpError(404, "Device not found.");
    }
    res.status(200).json({ success: true, message, data: device });
  } catch (error) {
    next(error);
  }
}

async function approveDevice(req, res, next) {
  return updateDeviceStatus(req, res, "approved", "Device approved.", next);
}

async function revokeDevice(req, res, next) {
  return updateDeviceStatus(req, res, "revoked", "Device revoked.", next);
}

async function updateDeviceNickname(req, res, next) {
  try {
    const organizationId = assertTenantOrganizationId(req);
    const { id } = req.params;
    const { nickname } = req.body || {};
    assertObjectId(id, "device id");
    const normalizedNickname =
      nickname == null || String(nickname).trim() === ""
        ? null
        : String(nickname).trim();
    const device = await Device.findOneAndUpdate(
      { _id: id, organization: organizationId },
      { $set: { nickname: normalizedNickname } },
      { new: true }
    )
      .select("uuid nickname status createdAt lastSeenAt organization")
      .lean();
    if (!device) {
      throw createHttpError(404, "Device not found.");
    }
    res.status(200).json({
      success: true,
      message: "Device nickname updated.",
      data: device,
    });
  } catch (error) {
    next(error);
  }
}

async function deleteDevice(req, res, next) {
  try {
    const organizationId = assertTenantOrganizationId(req);
    const { id } = req.params;
    assertObjectId(id, "device id");
    const device = await Device.findOne({ _id: id, organization: organizationId })
      .select("status")
      .lean();
    if (!device) {
      throw createHttpError(404, "Device not found.");
    }
    if (device.status !== "revoked") {
      throw createHttpError(400, "Only revoked devices can be deleted.");
    }
    await Device.deleteOne({ _id: id, organization: organizationId });
    res.status(200).json({ success: true, message: "Device deleted." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listDevices,
  approveDevice,
  revokeDevice,
  updateDeviceNickname,
  deleteDevice,
};
