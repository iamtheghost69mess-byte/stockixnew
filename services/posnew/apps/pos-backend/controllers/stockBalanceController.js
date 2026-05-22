const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const StockBalance = require("../models/stockBalanceModel");
const stockBalanceService = require("../services/stockBalanceService");
const { assertTenantOrganization } = require("../utils/tenantOrg");

const listBalances = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { locationId } = req.query;
    const filter = { organization: orgId };
    if (locationId && mongoose.Types.ObjectId.isValid(String(locationId))) {
      filter.location = locationId;
    }
    const rows = await StockBalance.find(filter)
      .populate("ingredient", "name unit sku status currentStock")
      .populate("location", "name code")
      .sort({ updatedAt: -1 })
      .lean();
    const data = rows.map((b) => {
      const q = Number(b.quantity) || 0;
      const r = Number(b.reservedQty) || 0;
      return {
        ...b,
        availableQty: Math.max(0, q - r),
      };
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const patchBalancePlanning = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { locationId, ingredientId, reservedQty, incomingQty, maxStockLevel } =
      req.body;
    if (
      !locationId ||
      !ingredientId ||
      !mongoose.Types.ObjectId.isValid(locationId) ||
      !mongoose.Types.ObjectId.isValid(ingredientId)
    ) {
      return next(
        createHttpError(400, "Valid locationId and ingredientId are required.")
      );
    }
    const lid = await stockBalanceService.resolveLocationIdOrDefaultForOrg(
      locationId,
      orgId
    );
    const Ingredient = require("../models/ingredientModel");
    const ingOk = await Ingredient.exists({
      _id: ingredientId,
      organization: orgId,
    });
    if (!ingOk) {
      return next(createHttpError(404, "Ingredient not found."));
    }
    const row = await stockBalanceService.getOrCreateBalance(
      lid,
      ingredientId
    );
    if (reservedQty !== undefined) {
      row.reservedQty = Math.max(0, Number(reservedQty) || 0);
    }
    if (incomingQty !== undefined) {
      row.incomingQty = Math.max(0, Number(incomingQty) || 0);
    }
    if (maxStockLevel !== undefined) {
      row.maxStockLevel = Math.max(0, Number(maxStockLevel) || 0);
    }
    await row.save();
    res.status(200).json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
};

const postTransfer = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const {
      fromLocationId,
      toLocationId,
      ingredientId,
      quantity,
      note,
    } = req.body;
    if (!ingredientId || !mongoose.Types.ObjectId.isValid(ingredientId)) {
      return next(createHttpError(400, "Valid ingredientId is required."));
    }
    const result = await stockBalanceService.transferQuantity({
      fromLocationId,
      toLocationId,
      ingredientId,
      quantity,
      userId: req.user?._id || null,
      note: note != null ? String(note).slice(0, 500) : "",
      organizationId: orgId,
    });
    const { emitPos } = require("../utils/socketEmit");
    emitPos(req, "inventory:updated", {
      ingredientIds: [String(ingredientId)],
      at: Date.now(),
    });
    res.status(200).json({ success: true, data: result });
  } catch (e) {
    if (e.message && e.message.includes("Insufficient")) {
      return next(createHttpError(400, e.message));
    }
    next(e);
  }
};

module.exports = {
  listBalances,
  patchBalancePlanning,
  postTransfer,
};
