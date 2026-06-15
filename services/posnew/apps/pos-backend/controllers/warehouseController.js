const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Zone = require("../models/zoneModel");
const Bin = require("../models/binModel");
const { assertTenantOrganization } = require("../utils/tenantOrg");

const listZones = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { locationId } = req.query;
    const q = { organization: orgId };
    if (locationId) q.location = locationId;

    const rows = await Zone.find(q).lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const createZone = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { location, name, description } = req.body;
    const zone = new Zone({ organization: orgId, location, name, description });
    await zone.save();
    res.status(201).json({ success: true, data: zone });
  } catch (e) {
    next(e);
  }
};

const listBins = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { zoneId } = req.query;
    const q = { organization: orgId };
    if (zoneId) q.zone = zoneId;

    const rows = await Bin.find(q).lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const createBin = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { zone, name, description, capacity } = req.body;
    const bin = new Bin({ organization: orgId, zone, name, description, capacity });
    await bin.save();
    res.status(201).json({ success: true, data: bin });
  } catch (e) {
    next(e);
  }
};

const patchZone = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid zone id."));
    }
    const zone = await Zone.findOne({ _id: id, organization: orgId });
    if (!zone) return next(createHttpError(404, "Zone not found."));
    const { name, description, status } = req.body;
    if (name !== undefined) zone.name = String(name).trim();
    if (description !== undefined) zone.description = String(description ?? "").trim();
    if (status !== undefined) {
      if (!["active", "archived"].includes(status)) {
        return next(createHttpError(400, "status must be active or archived."));
      }
      zone.status = status;
    }
    await zone.save();
    res.status(200).json({ success: true, data: zone });
  } catch (e) {
    if (e.code === 11000) {
      return next(
        createHttpError(409, "A zone with this name already exists for this location."),
      );
    }
    next(e);
  }
};

const patchBin = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid bin id."));
    }
    const bin = await Bin.findOne({ _id: id, organization: orgId });
    if (!bin) return next(createHttpError(404, "Bin not found."));
    const { name, description, capacity, status } = req.body;
    if (name !== undefined) bin.name = String(name).trim();
    if (description !== undefined) bin.description = String(description ?? "").trim();
    if (capacity !== undefined) {
      if (capacity === null || capacity === "") {
        bin.capacity = null;
      } else {
        const c = Number(capacity);
        if (!Number.isFinite(c) || c < 0) {
          return next(createHttpError(400, "capacity must be a non-negative number or null."));
        }
        bin.capacity = c;
      }
    }
    if (status !== undefined) {
      if (!["active", "archived"].includes(status)) {
        return next(createHttpError(400, "status must be active or archived."));
      }
      bin.status = status;
    }
    await bin.save();
    res.status(200).json({ success: true, data: bin });
  } catch (e) {
    if (e.code === 11000) {
      return next(
        createHttpError(409, "A bin with this name already exists in this zone."),
      );
    }
    next(e);
  }
};

module.exports = {
  listZones,
  createZone,
  patchZone,
  listBins,
  createBin,
  patchBin,
};
