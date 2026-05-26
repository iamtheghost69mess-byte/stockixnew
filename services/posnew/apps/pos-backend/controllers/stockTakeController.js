const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const StockTakeSession = require("../models/stockTakeSessionModel");
const StockBalance = require("../models/stockBalanceModel");
const Ingredient = require("../models/ingredientModel");
const StockMovement = require("../models/stockMovementModel");
const stockBalanceService = require("../services/stockBalanceService");
const accountingService = require("../services/accountingService");
const { recordInventoryAudit } = require("../services/inventoryAuditService");
const { emitPos } = require("../utils/socketEmit");
const Location = require("../models/locationModel");
const { assertTenantOrganization } = require("../utils/tenantOrg");

const createSession = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { locationId, note, blindCount, countMethod } = req.body;
    if (!locationId || !mongoose.Types.ObjectId.isValid(locationId)) {
      return next(createHttpError(400, "Valid locationId is required."));
    }
    const locOk = await Location.exists({
      _id: locationId,
      organization: orgId,
    });
    if (!locOk) {
      return next(createHttpError(404, "Location not found."));
    }
    const balances = await StockBalance.find({
      location: locationId,
      organization: orgId,
    })
      .select("ingredient quantity bin")
      .lean();
    const method = countMethod === "cycle" || countMethod === "spot" ? countMethod : "full";
    const lines = [];

    if (method === "cycle" || method === "spot") {
      for (const b of balances) {
        lines.push({
          ingredient: b.ingredient,
          bin: b.bin || null,
          systemQty: Number(b.quantity) || 0,
          countedQty: null,
        });
      }
      if (lines.length === 0) {
        return next(
          createHttpError(
            400,
            "No stock balance rows at this location for a cycle/spot session. Use countMethod full or create balances first."
          )
        );
      }
    } else {
      const activeIngredients = await Ingredient.find({
        organization: orgId,
        status: "active",
      })
        .select("_id")
        .lean();
      for (const b of balances) {
        lines.push({
          ingredient: b.ingredient,
          bin: b.bin || null,
          systemQty: Number(b.quantity) || 0,
          countedQty: null,
        });
      }
      for (const ing of activeIngredients) {
        if (balances.some((b) => String(b.ingredient) === String(ing._id))) {
          continue;
        }
        lines.push({
          ingredient: ing._id,
          bin: null,
          systemQty: 0,
          countedQty: null,
        });
      }
    }
    const doc = await StockTakeSession.create({
      organization: orgId,
      location: locationId,
      status: "in_progress",
      blindCount: !!blindCount,
      countMethod: method,
      note: note != null ? String(note).slice(0, 500) : "",
      lines,
      createdBy: req.user?._id || null,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const getSession = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await StockTakeSession.findOne({
      _id: id,
      organization: orgId,
    })
      .populate("location", "name code")
      .populate("lines.ingredient", "name unit sku isSerialTracked")
      .populate("lines.bin", "name code");
    if (!doc) return next(createHttpError(404, "Not found"));

    // Enforce Blind Count: Hide systemQty if blindCount is true and status is not posted/awaiting_approval
    // Recommendation: Allow creator to see it, hide for others.
    const isCreator = String(doc.createdBy) === String(req.user?._id);
    const isFinalized = ["posted", "awaiting_approval"].includes(doc.status);

    if (doc.blindCount && !isCreator && !isFinalized) {
      const sanitizedDoc = doc.toObject();
      sanitizedDoc.lines = sanitizedDoc.lines.map((l) => ({
        ...l,
        systemQty: 0, // Zero out visibility
      }));
      return res.status(200).json({ success: true, data: sanitizedDoc });
    }

    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const listSessions = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { locationId, status } = req.query;
    const q = { organization: orgId };
    if (locationId && mongoose.Types.ObjectId.isValid(locationId)) {
      q.location = locationId;
    }
    if (status) q.status = status;
    const rows = await StockTakeSession.find(q)
      .populate("location", "name code")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

/**
 * Body: { lines: [ { lineId, countedQty } ] }
 */
const patchCounts = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await StockTakeSession.findOne({
      _id: id,
      organization: orgId,
    });
    if (!doc) return next(createHttpError(404, "Not found"));
    if (doc.status === "posted") {
      return next(createHttpError(400, "Session already posted."));
    }
    if (doc.status === "awaiting_approval") {
      return next(
        createHttpError(400, "Counts are frozen while awaiting approval.")
      );
    }
    const { lines } = req.body;
    if (!Array.isArray(lines)) {
      return next(createHttpError(400, "lines array required."));
    }
    for (const row of lines) {
      if (!row.lineId) continue;
      const line = doc.lines.id(row.lineId);
      if (!line) continue;
      if (row.countedQty !== undefined && row.countedQty !== null) {
        const c = Number(row.countedQty);
        if (Number.isNaN(c) || c < 0) {
          return next(createHttpError(400, "countedQty must be non-negative."));
        }
        line.countedQty = c;
      }
    }
    doc.status = "in_progress";
    await doc.save();
    const populated = await StockTakeSession.findById(doc._id)
      .populate("lines.ingredient", "name unit sku isSerialTracked")
      .populate("lines.bin", "name code");
    res.status(200).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

/**
 * Submit completed counts for manager approval (optional workflow).
 */
const submitForApproval = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await StockTakeSession.findOne({
      _id: id,
      organization: orgId,
    });
    if (!doc) return next(createHttpError(404, "Not found"));
    if (doc.status !== "in_progress") {
      return next(
        createHttpError(400, "Only in-progress sessions can be submitted for approval.")
      );
    }
    for (const line of doc.lines) {
      if (line.countedQty === null || line.countedQty === undefined) {
        return next(
          createHttpError(400, "All lines must have countedQty before submit.")
        );
      }
    }
    doc.status = "awaiting_approval";
    await doc.save();
    const populated = await StockTakeSession.findById(doc._id)
      .populate("lines.ingredient", "name unit sku isSerialTracked")
      .populate("lines.bin", "name code")
      .populate("location", "name code");
    res.status(200).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

/**
 * Approve a session that is awaiting approval (returns to in_progress, postable).
 */
const approveSession = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await StockTakeSession.findOne({
      _id: id,
      organization: orgId,
    });
    if (!doc) return next(createHttpError(404, "Not found"));
    if (doc.status !== "awaiting_approval") {
      return next(
        createHttpError(400, "Session is not awaiting approval.")
      );
    }
    doc.status = "in_progress";
    doc.approvedBy = req.user?._id || null;
    doc.approvedAt = new Date();
    await doc.save();
    const populated = await StockTakeSession.findById(doc._id)
      .populate("lines.ingredient", "name unit sku isSerialTracked")
      .populate("lines.bin", "name code")
      .populate("location", "name code");
    res.status(200).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

const postSession = async (req, res, next) => {
  const orgId = assertTenantOrganization(req);
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(createHttpError(400, "Invalid id"));
  }

  let dbSession = null;
  try {
    const doc = await StockTakeSession.findOne({
      _id: id,
      organization: orgId,
    });
    if (!doc) return next(createHttpError(404, "Not found"));
    if (doc.status === "posted") {
      return next(createHttpError(400, "Already posted."));
    }
    if (doc.status === "awaiting_approval") {
      return next(
        createHttpError(
          400,
          "Session is awaiting approval. Approve it before posting."
        )
      );
    }

    const locId = String(doc.location);
    const touched = [];

    let accountingCfgSnapshot = null;
    try {
      accountingCfgSnapshot = await accountingService.getConfig(orgId);
    } catch {
      accountingCfgSnapshot = null;
    }

    for (const line of doc.lines) {
      if (line.countedQty === null || line.countedQty === undefined) {
        return next(
          createHttpError(
            400,
            "All lines must have countedQty before posting."
          )
        );
      }
    }

    dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    const locked = await StockTakeSession.findOne({
      _id: id,
      organization: orgId,
    }).session(dbSession);
    if (!locked || locked.status === "posted") {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return next(createHttpError(400, "Session state changed; retry."));
    }
    if (locked.status === "awaiting_approval") {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return next(
        createHttpError(
          400,
          "Session is awaiting approval. Approve it before posting."
        )
      );
    }

    const movements = [];

    for (const line of locked.lines) {
      const system = Number(line.systemQty) || 0;
      const counted = Number(line.countedQty) || 0;
      const delta = counted - system;

      line.varianceQty = delta;

      const ing = await Ingredient.findOne({
        _id: line.ingredient,
        organization: orgId,
      }).session(dbSession);
      if (!ing) {
        line.varianceValue = 0;
        continue;
      }

      const cost = Number(ing.averageUnitCost) || Number(ing.unitCost) || 0;
      line.varianceValue = delta * cost;

      if (Math.abs(delta) < 1e-9) continue;

      if (ing.isSerialTracked) {
        await dbSession.abortTransaction();
        dbSession.endSession();
        dbSession = null;
        const err = createHttpError(
          400,
          `Stock take cannot post variance for serial-tracked ingredient "${ing.name}". Use Inventory > Adjust with serial numbers.`
        );
        err.code = "STOCK_TAKE_SERIAL_VARIANCE";
        err.ingredientId = String(ing._id);
        err.ingredientName = ing.name;
        return next(err);
      }

      const result = await stockBalanceService.applyQuantityDelta(
        locId,
        ing._id,
        delta,
        dbSession,
        line.bin || null
      );

      movements.push({
        organization: orgId,
        ingredient: ing._id,
        delta,
        balanceAfter: result.totalStock,
        reason: "correction",
        note: `Stock take ${locked._id}`,
        user: req.user?._id || null,
        location: locId,
        bin: line.bin || null,
        extendedValue: delta * cost,
        costAmount: delta !== 0 ? cost : 0,
      });

      touched.push(String(ing._id));
    }

    if (movements.length) {
      await StockMovement.insertMany(movements, { session: dbSession });
    }

    const journalResult = await accountingService.postStockTakeJournalEntry({
      organizationId: orgId,
      sessionId: locked._id,
      locationId: locked.location,
      lines: locked.lines,
      userId: req.user?._id,
      accountingConfigDoc: accountingCfgSnapshot,
      session: dbSession,
    });
    if (journalResult.entry) {
      locked.journalEntry = journalResult.entry._id;
    }

    await recordInventoryAudit({
      organizationId: orgId,
      action: "stock_take.posted",
      sourceType: "stock_take_session",
      sourceId: locked._id,
      actorId: req.user?._id,
      metadata: {
        movementCount: movements.length,
        locationId: String(locked.location),
      },
      session: dbSession,
    });

    locked.status = "posted";
    locked.postedAt = new Date();
    await locked.save({ session: dbSession });

    await dbSession.commitTransaction();
    dbSession.endSession();
    dbSession = null;

    if (touched.length) {
      emitPos(req, "inventory:updated", {
        ingredientIds: [...new Set(touched)],
        at: Date.now(),
      });
    }

    const populated = await StockTakeSession.findById(locked._id)
      .populate("lines.ingredient", "name unit sku isSerialTracked")
      .populate("lines.bin", "name code")
      .populate("location", "name code");
    res.status(200).json({ success: true, data: populated });
  } catch (e) {
    if (dbSession) {
      try {
        await dbSession.abortTransaction();
      } catch {
        /* ignore */
      }
      try {
        dbSession.endSession();
      } catch {
        /* ignore */
      }
    }
    next(e);
  }
};

module.exports = {
  createSession,
  getSession,
  listSessions,
  patchCounts,
  submitForApproval,
  approveSession,
  postSession,
};
