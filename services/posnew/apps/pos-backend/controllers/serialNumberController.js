const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const SerialNumber = require("../models/serialNumberModel");
const StockMovement = require("../models/stockMovementModel");
const Ingredient = require("../models/ingredientModel");
const { assertTenantOrganization } = require("../utils/tenantOrg");

const MAX_QUERY_SERIAL_LENGTH = 128;
const MAX_SERIAL_FORMAT_LENGTH = 128;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isValidSerialFormatPattern = (pattern) =>
  /^[A-Za-z0-9._:+\-#*?/]+$/.test(pattern);

const matchesSimplePattern = (value, pattern) => {
  const source = String(value ?? "");
  const format = String(pattern ?? "");
  const rows = source.length + 1;
  const cols = format.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(false));
  dp[0][0] = true;

  for (let j = 1; j < cols; j += 1) {
    if (format[j - 1] === "*") {
      dp[0][j] = dp[0][j - 1];
    }
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const token = format[j - 1];
      if (token === "*") {
        dp[i][j] = dp[i][j - 1] || dp[i - 1][j];
      } else if (token === "?" || token === source[i - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      }
    }
  }

  return dp[source.length][format.length];
};

/**
 * List or search for serial numbers.
 */
const listSerials = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { serial, ingredientId, status, locationId } = req.query;
    const q = { organization: orgId };

    if (serial) {
      const normalizedSerial = String(serial).trim().slice(0, MAX_QUERY_SERIAL_LENGTH);
      q.serial = { $regex: escapeRegex(normalizedSerial), $options: "i" };
    }
    if (ingredientId && mongoose.Types.ObjectId.isValid(ingredientId)) {
      q.ingredient = ingredientId;
    }
    if (status) q.status = status;
    if (locationId && mongoose.Types.ObjectId.isValid(locationId)) {
      q.location = locationId;
    }

    const rows = await SerialNumber.find(q)
      .populate("ingredient", "name unit sku")
      .populate("location", "name code")
      .populate("bin", "name")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

/**
 * Get full lifecycle history for a specific serial number.
 */
const getSerialHistory = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { serial } = req.params;

    if (!serial) return next(createHttpError(400, "Serial identifier is required."));

    const doc = await SerialNumber.findOne({
      organization: orgId,
      serial: serial
    }).populate("ingredient", "name unit sku").lean();

    if (!doc) return next(createHttpError(404, "Serial number record not found."));

    // Find all movements where this serial number was involved
    const movements = await StockMovement.find({
      organization: orgId,
      ingredient: doc.ingredient._id,
      serialNumbers: serial
    })
    .populate("user", "name")
    .populate("location", "name")
    .populate("counterLocation", "name")
    .sort({ createdAt: -1 })
    .lean();

    res.status(200).json({ 
      success: true, 
      data: {
        serial: doc,
        movements
      } 
    });
  } catch (e) {
    next(e);
  }
};

const normalizeSerial = (raw) => String(raw || "").trim();

const assertIngredientTracksSerials = async (orgId, ingredientId) => {
  if (!mongoose.Types.ObjectId.isValid(ingredientId)) {
    throw createHttpError(400, "Valid ingredientId is required.");
  }
  const ing = await Ingredient.findOne({ _id: ingredientId, organization: orgId })
    .select("name isSerialTracked serialNumberFormat")
    .lean();
  if (!ing) throw createHttpError(404, "Ingredient not found.");
  if (!ing.isSerialTracked) {
    throw createHttpError(400, `Ingredient "${ing.name}" is not configured for serial tracking.`);
  }
  return ing;
};

const assertSerialMatchesFormat = (serial, ing) => {
  if (!ing.serialNumberFormat) return;
  const pattern = String(ing.serialNumberFormat).trim();
  if (!pattern || pattern.length > MAX_SERIAL_FORMAT_LENGTH) {
    throw createHttpError(400, "Ingredient serial format is invalid.");
  }
  if (!isValidSerialFormatPattern(pattern)) {
    throw createHttpError(
      400,
      "Ingredient serial format is invalid. Use literals plus * and ? wildcards only."
    );
  }
  if (!matchesSimplePattern(serial, pattern)) {
    throw createHttpError(
      400,
      `Serial "${serial}" does not match ingredient format "${pattern}".`
    );
  }
};

/**
 * POST /api/serials
 * Body: { serial: string, ingredientId, locationId?, binId?, stockLot? }
 * Registers a new serial for an `isSerialTracked` ingredient. Idempotent on (org, serial).
 */
const registerSerial = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { ingredientId, locationId, binId, stockLot } = req.body || {};
    const serial = normalizeSerial(req.body?.serial);
    if (!serial) return next(createHttpError(400, "serial is required."));

    const ing = await assertIngredientTracksSerials(orgId, ingredientId);
    assertSerialMatchesFormat(serial, ing);

    const existing = await SerialNumber.findOne({ organization: orgId, serial });
    if (existing) {
      return res.status(200).json({ success: true, data: existing, idempotent: true });
    }

    const doc = await SerialNumber.create({
      organization: orgId,
      serial,
      ingredient: ingredientId,
      location: locationId && mongoose.Types.ObjectId.isValid(locationId) ? locationId : null,
      bin: binId && mongoose.Types.ObjectId.isValid(binId) ? binId : null,
      stockLot: stockLot && mongoose.Types.ObjectId.isValid(stockLot) ? stockLot : null,
      status: "available",
    });

    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/serials/:serial/consume
 * Body: { reason?: string, locationId? }
 * Marks a serial as consumed (sold / destroyed / written off).
 */
const consumeSerial = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const serial = normalizeSerial(req.params.serial);
    if (!serial) return next(createHttpError(400, "serial is required."));

    const doc = await SerialNumber.findOne({ organization: orgId, serial });
    if (!doc) return next(createHttpError(404, "Serial not found."));
    if (doc.status === "consumed") {
      return res.status(200).json({ success: true, data: doc, idempotent: true });
    }
    if (doc.status !== "available" && doc.status !== "transferred") {
      return next(createHttpError(400, `Cannot consume a ${doc.status} serial.`));
    }

    doc.status = "consumed";
    await doc.save();

    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/serials/:serial/transfer
 * Body: { toLocationId: string, toBinId?: string }
 * Moves a serial to another location/bin.
 */
const transferSerial = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const serial = normalizeSerial(req.params.serial);
    if (!serial) return next(createHttpError(400, "serial is required."));
    const { toLocationId, toBinId } = req.body || {};
    if (!toLocationId || !mongoose.Types.ObjectId.isValid(toLocationId)) {
      return next(createHttpError(400, "toLocationId is required."));
    }

    const doc = await SerialNumber.findOne({ organization: orgId, serial });
    if (!doc) return next(createHttpError(404, "Serial not found."));
    if (doc.status !== "available" && doc.status !== "transferred") {
      return next(createHttpError(400, `Cannot transfer a ${doc.status} serial.`));
    }

    doc.location = toLocationId;
    doc.bin = toBinId && mongoose.Types.ObjectId.isValid(toBinId) ? toBinId : null;
    doc.status = "transferred";
    await doc.save();

    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listSerials,
  getSerialHistory,
  registerSerial,
  consumeSerial,
  transferSerial,
};
