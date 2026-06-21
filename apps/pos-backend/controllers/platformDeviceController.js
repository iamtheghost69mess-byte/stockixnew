const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Device = require("../models/deviceModel");

function assertObjectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(String(value))) {
    throw createHttpError(400, `Invalid ${label}.`);
  }
}

function readOrganizationFilter(query) {
  const organizationId = String(query?.organizationId || "").trim();
  if (!organizationId) {
    throw createHttpError(400, "organizationId is required.");
  }
  assertObjectId(organizationId, "organizationId");
  return new mongoose.Types.ObjectId(organizationId);
}

/** When omitted, platform list/count applies across all organizations. */
function readOptionalOrganizationFilter(query) {
  const organizationId = String(query?.organizationId || "").trim();
  if (!organizationId) {
    return null;
  }
  assertObjectId(organizationId, "organizationId");
  return new mongoose.Types.ObjectId(organizationId);
}

function readStatusFilter(query) {
  const status = String(query?.status || "").trim();
  if (!status || status === "all") return null;
  if (!["pending", "approved", "revoked"].includes(status)) {
    throw createHttpError(400, "Invalid status filter.");
  }
  return status;
}

function readOrganizationIdFromMutationRequest(req) {
  const orgFromQuery = String(req.query?.organizationId || "").trim();
  const orgFromBody = String(req.body?.organizationId || "").trim();
  const organizationId = orgFromQuery || orgFromBody;
  if (!organizationId) {
    throw createHttpError(400, "organizationId is required.");
  }
  assertObjectId(organizationId, "organizationId");
  return new mongoose.Types.ObjectId(organizationId);
}

async function listDevices(req, res, next) {
  try {
    const organization = readOptionalOrganizationFilter(req.query);
    const status = readStatusFilter(req.query);
    let filter;
    if (organization) {
      filter = status ? { organization, status } : { organization };
    } else {
      filter = status ? { status } : {};
    }
    const devices = await Device.find(filter)
      .sort({ createdAt: -1 })
      .select("uuid nickname status createdAt lastSeenAt organization")
      .lean();
    res.status(200).json({ success: true, data: devices });
  } catch (error) {
    next(error);
  }
}

async function pendingCount(req, res, next) {
  try {
    const organization = readOptionalOrganizationFilter(req.query);
    const filter = organization
      ? { organization, status: "pending" }
      : { status: "pending" };
    const count = await Device.countDocuments(filter);
    res.status(200).json({ success: true, count });
  } catch (error) {
    next(error);
  }
}

async function changeStatus(req, res, nextStatus, message, next) {
  try {
    const { id } = req.params;
    const organization = readOrganizationIdFromMutationRequest(req);
    assertObjectId(id, "device id");
    const current = await Device.findOne({ _id: id, organization })
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
      { _id: id, organization },
      { $set: { status: nextStatus } },
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
  return changeStatus(req, res, "approved", "Device approved.", next);
}

async function revokeDevice(req, res, next) {
  return changeStatus(req, res, "revoked", "Device revoked.", next);
}

async function updateNickname(req, res, next) {
  try {
    const { id } = req.params;
    const organization = readOrganizationIdFromMutationRequest(req);
    assertObjectId(id, "device id");
    const { nickname } = req.body || {};
    const normalizedNickname =
      nickname == null || String(nickname).trim() === ""
        ? null
        : String(nickname).trim();
    const device = await Device.findOneAndUpdate(
      { _id: id, organization },
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
    const { id } = req.params;
    const organization = readOrganizationIdFromMutationRequest(req);
    assertObjectId(id, "device id");
    const device = await Device.findOne({ _id: id, organization })
      .select("status")
      .lean();
    if (!device) {
      throw createHttpError(404, "Device not found.");
    }
    throw createHttpError(
      409,
      "Device records are immutable after decision. Deletion is disabled."
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listDevices,
  pendingCount,
  approveDevice,
  revokeDevice,
  updateNickname,
  deleteDevice,
};
