const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Ingredient = require("../models/ingredientModel");
const StockMovement = require("../models/stockMovementModel");
const MenuItem = require("../models/menuItemModel");
const MenuItemVariant = require("../models/menuItemVariantModel");
/** Customer restock must use `POST /api/inventory/returns`, not adjust. */
const ADJUST_REASONS = ["manual_adjust", "waste", "receive", "correction"];
const {
  listLowStockIngredients,
  buildInventoryReport,
} = require("../services/inventoryService");
const inventoryCostService = require("../services/inventoryCostService");
const stockBalanceService = require("../services/stockBalanceService");
const { emitPos } = require("../utils/socketEmit");
const { parsePaginationQuery } = require("../utils/listPagination");
const IngredientPriceHistory = require("../models/ingredientPriceHistoryModel");
const WastageEntry = require("../models/wastageEntryModel");
const { WASTAGE_REASONS } = require("../models/wastageEntryModel");
const stockLotService = require("../services/stockLotService");
const { resolveStockableDemand } = require("../services/inventoryRecipeUtils");
const { recordInventoryAudit } = require("../services/inventoryAuditService");
const { assertTenantOrganization } = require("../utils/tenantOrg");
const {
  enqueueBigcapitalInventoryAdjustIfEnabled,
} = require("../services/bigcapitalSyncEnqueue");
const PosAuditLog = require("../models/posAuditLogModel");

const FINANCE_SYNC_ADJUST_REASONS = ["manual_adjust", "waste", "correction"];

function parseOptionalDate(value, label) {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw createHttpError(400, `Invalid ${label}. Expected ISO date.`);
  }
  return d;
}

function parseOptionalObjectId(value, label) {
  if (value == null || value === "") return null;
  if (!mongoose.Types.ObjectId.isValid(String(value))) {
    throw createHttpError(400, `Invalid ${label}.`);
  }
  return new mongoose.Types.ObjectId(String(value));
}

function parseBarcode(value) {
  const barcode = String(value ?? "").trim();
  if (!barcode) {
    throw createHttpError(400, "Barcode is required");
  }
  if (barcode.length > 128) {
    throw createHttpError(400, "Barcode is too long.");
  }
  if (!/^[A-Za-z0-9._:/+\-#]+$/.test(barcode)) {
    throw createHttpError(400, "Barcode contains unsupported characters.");
  }
  return barcode;
}

async function logPosInventoryAudit(req, action, metadata = {}) {
  const organizationId = req.tenantOrganizationId || req.user?.organization || null;
  if (!organizationId) return;
  await PosAuditLog.create({
    organization: organizationId,
    location: req.locationScopeId || null,
    user: req.user?._id || null,
    action: String(action || "").trim(),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  });
}

const lowStock = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const pag = parsePaginationQuery(req.query);
    const baseQ = {
      organization: orgId,
      location: req.locationScopeId,
      status: { $ne: "archived" },
      $expr: {
        $lte: ["$currentStock", { $ifNull: ["$reorderThreshold", 0] }],
      },
    };
    if (pag.active) {
      const [data, total] = await Promise.all([
        Ingredient.find(baseQ)
          .sort({ name: 1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .lean(),
        Ingredient.countDocuments(baseQ),
      ]);
      return res.status(200).json({
        success: true,
        message: "Low stock ingredients.",
        data,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }
    const data = await listLowStockIngredients(orgId, req.locationScopeId);
    res.status(200).json({ success: true, message: "Low stock ingredients.", data });
  } catch (e) {
    next(e);
  }
};

const report = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const data = await buildInventoryReport(orgId, req.locationScopeId);
    const pag = parsePaginationQuery(req.query);
    if (pag.active) {
      const ingredients = data.ingredients || [];
      const total = ingredients.length;
      const pageItems = ingredients.slice(pag.skip, pag.skip + pag.limit);
      return res.status(200).json({
        success: true,
        message:
          "Paginated ingredient rows; belowThreshold and portionsByDish remain org-wide.",
        data: {
          ...data,
          ingredients: pageItems,
        },
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const movements = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const filter = { organization: orgId, location: req.locationScopeId };
    const from = parseOptionalDate(req.query.from, "from");
    const to = parseOptionalDate(req.query.to, "to");
    const locationObjectId = parseOptionalObjectId(
      req.query.locationId,
      "locationId"
    );
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }
    if (locationObjectId) {
      filter.location = locationObjectId;
    }
    const pag = parsePaginationQuery(req.query);

    if (pag.active) {
      const [rows, total] = await Promise.all([
        StockMovement.find(filter)
          .populate("ingredient", "name unit sku")
          .populate("order", "orderStatus")
          .populate("user", "name")
          .populate("location", "name code")
          .populate("counterLocation", "name code")
          .sort({ createdAt: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .lean(),
        StockMovement.countDocuments(filter),
      ]);
      return res.status(200).json({
        success: true,
        data: rows,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }

    const legacyLimit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = await StockMovement.find(filter)
      .populate("ingredient", "name unit sku")
      .populate("order", "orderStatus")
      .populate("user", "name")
      .populate("location", "name code")
      .sort({ createdAt: -1 })
      .limit(legacyLimit)
      .lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

/**
 * Body (JSON):
 * - `ingredientId` (required)
 * - `quantityDelta` — change in **stock units** (ingredient.unit), unless `purchaseQty` is used
 * - `purchaseQty` — optional; if set with ingredient `purchaseUnit` + `purchaseToStockFactor`, delta = purchaseQty × factor
 * - `reason`: manual_adjust | waste | receive | correction (not customer_return — use `/api/inventory/returns`)
 * - `locationId` — optional; defaults to first location in org
 * - `unitCost` — for receive (per stock unit after conversion)
 * - `adjustmentUnitCost` — optional; for **positive** non-receive adjustments, per stock unit (defaults to average/unit cost; `0` = no cost layer change)
 * - `qualityStatus` — optional: passed | damaged | expired | recalled
 * - `note`, `wasteReasonCode`, `lotNumber`, `expiryDate`, `productionDate`, `supplierBatchRef` (ISO strings)
 */
const STOCK_MOVEMENT_QUALITY_STATUSES = [
  "passed",
  "damaged",
  "expired",
  "recalled",
];

const adjust = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const {
      ingredientId,
      quantityDelta,
      purchaseQty,
      reason,
      note,
      unitCost,
      locationId,
      wasteReasonCode,
      lotNumber,
      expiryDate,
      productionDate,
      supplierBatchRef,
      serialNumbers,
      binId,
      qualityStatus: qualityStatusRaw,
      adjustmentUnitCost: adjustmentUnitCostRaw,
    } = req.body;
    if (!ingredientId || !mongoose.Types.ObjectId.isValid(ingredientId)) {
      return next(createHttpError(400, "Valid ingredientId is required."));
    }

    if (String(reason || "").trim().toLowerCase() === "customer_return") {
      return next(
        createHttpError(
          400,
          "Customer returns must use POST /api/inventory/returns, not POST /api/inventory/adjust."
        )
      );
    }

    const r =
      reason && ADJUST_REASONS.includes(reason) ? reason : "manual_adjust";

    let qualityStatus = "passed";
    if (qualityStatusRaw != null && String(qualityStatusRaw).trim()) {
      const qs = String(qualityStatusRaw).trim();
      if (!STOCK_MOVEMENT_QUALITY_STATUSES.includes(qs)) {
        return next(
          createHttpError(
            400,
            `qualityStatus must be one of: ${STOCK_MOVEMENT_QUALITY_STATUSES.join(", ")}.`
          )
        );
      }
      qualityStatus = qs;
    }

    const ing = await Ingredient.findOne({
      _id: ingredientId,
      organization: orgId,
    });
    if (!ing) return next(createHttpError(404, "Ingredient not found."));

    let delta = quantityDelta != null ? Number(quantityDelta) : NaN;
    if (
      purchaseQty != null &&
      !Number.isNaN(Number(purchaseQty)) &&
      ing.purchaseUnit &&
      Number(ing.purchaseToStockFactor) > 0
    ) {
      delta = Number(purchaseQty) * Number(ing.purchaseToStockFactor);
    }
    if (Number.isNaN(delta)) {
      return next(
        createHttpError(400, "quantityDelta or valid purchaseQty is required.")
      );
    }

    let moveCostAmount = 0;
    let moveExtendedValue = 0;

    if (ing.isSerialTracked && delta < 0) {
      if (!Array.isArray(serialNumbers) || serialNumbers.length < Math.abs(delta)) {
        return next(
          createHttpError(
            400,
            `Serial numbers required for tracked item. Expected: ${Math.abs(delta)}`
          )
        );
      }
    }

    const exp =
      expiryDate && String(expiryDate).trim()
        ? new Date(expiryDate)
        : null;
    if (exp && Number.isNaN(exp.getTime())) {
      return next(createHttpError(400, "Invalid expiryDate."));
    }
    const prod =
      productionDate && String(productionDate).trim()
        ? new Date(productionDate)
        : null;
    if (prod && Number.isNaN(prod.getTime())) {
      return next(createHttpError(400, "Invalid productionDate."));
    }

    let totalStock;
    let locId;
    try {
      locId = await stockBalanceService.resolveLocationIdOrDefaultForOrg(
        locationId,
        orgId
      );
    } catch (e) {
      return next(
        createHttpError(
          400,
          e?.message ||
            "No locations exist for this organization. Create a location first."
        )
      );
    }

    let move;

    const applyCostingAndMovement = async (ingRow, session) => {
      const sess = session || null;
      const activeCostMethod = await inventoryCostService.getCostMethod();
      let consumedLotSlices = [];
      let hasUnverifiedFifoHistory = false;
      if (r === "receive" && delta > 0) {
        let ucPerStockUnit =
          unitCost != null && !Number.isNaN(Number(unitCost))
            ? Number(unitCost)
            : Number(ingRow.unitCost) || 0;
        if (
          purchaseQty != null &&
          ingRow.purchaseUnit &&
          Number(purchaseQty) > 0 &&
          Number(ingRow.purchaseToStockFactor) > 0
        ) {
          const purchaseUnitCost =
            unitCost != null && !Number.isNaN(Number(unitCost))
              ? Number(unitCost)
              : ucPerStockUnit;
          ucPerStockUnit =
            Number(ingRow.purchaseToStockFactor) > 0
              ? purchaseUnitCost / Number(ingRow.purchaseToStockFactor)
              : ucPerStockUnit;
          ingRow.lastPurchaseUnitCost = purchaseUnitCost;
          await ingRow.save(sess ? { session: sess } : {});
        }

        const costingResult = await inventoryCostService.addReceiveCost(
          ingRow._id,
          delta,
          ucPerStockUnit,
          sess
        );
        if (costingResult) {
          await IngredientPriceHistory.create(
            [
              {
                organization: orgId,
                ingredient: ingRow._id,
                unitPrice: costingResult.unitCost,
                source: "receive",
                note: note != null ? String(note).slice(0, 200) : "",
              },
            ],
            sess ? { session: sess } : {}
          );
          moveCostAmount = costingResult.unitCost;
          moveExtendedValue = costingResult.totalCost;
        } else {
          moveCostAmount = ucPerStockUnit;
          moveExtendedValue = inventoryCostService.round2(ucPerStockUnit * delta);
        }
      } else if (delta < 0) {
        if (locId) {
          consumedLotSlices = await stockLotService.consumeLotsByMethod(
            locId,
            ingRow._id,
            Math.abs(delta),
            activeCostMethod,
            sess
          );
          hasUnverifiedFifoHistory = consumedLotSlices.some(
            (slice) => slice.isUnverifiedFifoHistory
          );
        }
        const { totalCost } = await inventoryCostService.consumeIngredientCost(
          ingRow._id,
          Math.abs(delta),
          sess,
          consumedLotSlices
        );
        moveCostAmount = totalCost > 0 ? totalCost / Math.abs(delta) : 0;
        moveExtendedValue = -totalCost;
      } else if (delta > 0) {
        const explicitAdj =
          adjustmentUnitCostRaw != null && !Number.isNaN(Number(adjustmentUnitCostRaw))
            ? Number(adjustmentUnitCostRaw)
            : null;
        const adjUC =
          explicitAdj != null
            ? Math.max(0, explicitAdj)
            : Number(ingRow.averageUnitCost) > 0
              ? Number(ingRow.averageUnitCost)
              : Number(ingRow.unitCost) || 0;
        if (adjUC > 0) {
          const costingResult = await inventoryCostService.addReceiveCost(
            ingRow._id,
            delta,
            adjUC,
            sess
          );
          if (costingResult) {
            await IngredientPriceHistory.create(
              [
                {
                  organization: orgId,
                  ingredient: ingRow._id,
                  unitPrice: costingResult.unitCost,
                  source: "adjustment",
                  note: note != null ? String(note).slice(0, 200) : `${r} (+qty)`,
                },
              ],
              sess ? { session: sess } : {}
            );
            moveCostAmount = costingResult.unitCost;
            moveExtendedValue = costingResult.totalCost;
          }
        } else {
          moveCostAmount = 0;
          moveExtendedValue = 0;
        }
      } else {
        moveCostAmount = 0;
        moveExtendedValue = 0;
      }

      if (delta > 0 && locId) {
        const lotSource =
          r === "receive"
            ? "manual"
            : r === "manual_adjust" || r === "correction"
              ? "adjustment"
              : "manual";
        const derivedCost =
          Number(moveCostAmount) > 0
            ? Number(moveCostAmount)
            : Number(ingRow.averageUnitCost) > 0
              ? Number(ingRow.averageUnitCost)
              : Number(ingRow.unitCost) || 0;
        await stockLotService.createInboundLot({
          locationId: locId,
          ingredientId: ingRow._id,
          quantity: delta,
          lotNumber: lotNumber != null ? String(lotNumber) : "",
          receivedAt: new Date(),
          unitCost: derivedCost,
          expiryDate: exp,
          productionDate: prod,
          supplierBatchRef: supplierBatchRef != null ? String(supplierBatchRef) : "",
          purchaseOrderId: null,
          source: lotSource,
          zoneId: null,
          binId: binId || null,
          isUnverifiedFifoHistory: true,
          session: sess,
        });
      }

      const created = await StockMovement.create(
        [
          {
            organization: orgId,
            ingredient: ingRow._id,
            delta,
            balanceAfter: totalStock,
            reason: r,
            movementType:
              r === "order_deduction" || r === "sale"
                ? "sale"
                : r === "waste" || r === "wastage"
                  ? "wastage"
                  : r === "receive"
                    ? "receive"
                    : r === "transfer_in" || r === "transfer_out"
                      ? "transfer"
                      : "adjustment",
            qualityStatus,
            note: note != null ? String(note).slice(0, 500) : "",
            user: req.user?._id || null,
            location: locId,
            bin: binId || null,
            costAmount: moveCostAmount,
            extendedValue: moveExtendedValue,
            wasteReasonCode:
              wasteReasonCode != null ? String(wasteReasonCode).slice(0, 64) : "",
            lotNumber:
              consumedLotSlices.length > 0
                ? consumedLotSlices
                    .map((slice) => String(slice.lotNumber || "").trim())
                    .filter(Boolean)
                    .join(",")
                : lotNumber != null
                  ? String(lotNumber).slice(0, 64)
                  : "",
            expiryDate:
              consumedLotSlices.find((slice) => slice.expiryDate)?.expiryDate ||
              exp,
            productionDate: prod && !Number.isNaN(prod.getTime()) ? prod : null,
            supplierBatchRef:
              supplierBatchRef != null ? String(supplierBatchRef).slice(0, 128) : "",
            isUnverifiedFifoHistory,
            serialNumbers: Array.isArray(serialNumbers) ? serialNumbers : [],
          },
        ],
        sess ? { session: sess } : {}
      );
      move = created[0];

      if (ingRow.isSerialTracked && delta > 0 && Array.isArray(serialNumbers)) {
        const SerialNumber = require("../models/serialNumberModel");
        for (const s of serialNumbers) {
          await SerialNumber.findOneAndUpdate(
            { organization: orgId, serial: s, ingredient: ingRow._id },
            { status: "available", location: locId, bin: binId, lastMovement: move._id },
            { upsert: true, ...(sess ? { session: sess } : {}) }
          );
        }
      }

      if (ingRow.isSerialTracked && delta < 0 && Array.isArray(serialNumbers)) {
        const SerialNumber = require("../models/serialNumberModel");
        await SerialNumber.updateMany(
          { organization: orgId, serial: { $in: serialNumbers }, ingredient: ingRow._id },
          { status: "consumed", lastMovement: move._id },
          sess ? { session: sess } : {}
        );
      }
    };

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const ingRow = await Ingredient.findOne({
          _id: ingredientId,
          organization: orgId,
        }).session(dbSession);
        if (!ingRow) {
          throw createHttpError(404, "Ingredient not found.");
        }
        const result = await stockBalanceService.applyQuantityDelta(
          locId,
          ingRow._id,
          delta,
          dbSession,
          binId || null
        );
        totalStock = result.totalStock;
        await applyCostingAndMovement(ingRow, dbSession);
      });
    } finally {
      dbSession.endSession();
    }

    emitPos(req, "inventory:updated", {
      ingredientIds: [String(ing._id)],
      at: Date.now(),
    });

    if (totalStock <= Number(ing.reorderThreshold || 0)) {
      emitPos(req, "inventory:low-stock", {
        ingredientIds: [String(ing._id)],
      });
    }

    try {
      await recordInventoryAudit({
        organizationId: orgId,
        action: "inventory.adjust",
        sourceType: "ingredient",
        sourceId: ing._id,
        actorId: req.user?._id,
        metadata: {
          delta,
          reason: String(reason || ""),
          locationId: locId || null,
          binId: binId || null,
        },
      });
    } catch {
      /* non-fatal */
    }

    const fresh = await Ingredient.findById(ing._id);
    await logPosInventoryAudit(req, "stock_adjustment", {
      ingredientId: String(ing._id),
      delta,
      reason: r,
      locationId: locId ? String(locId) : null,
    });

    if (FINANCE_SYNC_ADJUST_REASONS.includes(r) && move?._id) {
      const unitCostForFinance =
        Math.abs(Number(moveCostAmount) || 0) ||
        Math.abs(Number(ing.averageUnitCost) || Number(ing.unitCost) || 0);
      enqueueBigcapitalInventoryAdjustIfEnabled(
        {
          organizationId: String(orgId),
          ingredientId: String(ing._id),
          delta,
          unitCost: unitCostForFinance,
          reason: r,
          referenceNo: `pos-adjust-${move._id}`,
          description: note != null ? String(note).slice(0, 200) : r,
        },
        {
          idempotencyKey: `bigcapital_adj_${move._id}`,
          originatedBy: "inventoryController.adjust",
        }
      ).catch((err) => {
        console.error(
          "[inventory.adjust] Finance variance enqueue failed:",
          err.message
        );
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ingredient: fresh,
        delta,
        balanceAfter: totalStock,
        locationId: locId,
      },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Customer return restock.
 * Body:
 * - ingredientId (required)
 * - quantity (required, > 0 in stock units)
 * - locationId (optional; defaults per org setting)
 * - note (optional)
 * - unitCost (optional, defaults to ingredient avg/unit cost)
 */
const customerReturn = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { ingredientId, quantity, locationId, note, unitCost } = req.body;
    if (!ingredientId || !mongoose.Types.ObjectId.isValid(String(ingredientId))) {
      return next(createHttpError(400, "Valid ingredientId is required."));
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return next(createHttpError(400, "quantity must be a positive number."));
    }

    const ing = await Ingredient.findOne({
      _id: ingredientId,
      organization: orgId,
    });
    if (!ing) return next(createHttpError(404, "Ingredient not found."));

    let locId;
    try {
      locId = await stockBalanceService.resolveLocationIdOrDefaultForOrg(
        locationId,
        orgId
      );
    } catch (e) {
      return next(
        createHttpError(
          400,
          e?.message ||
            "No locations exist for this organization. Create a location first."
        )
      );
    }

    const uc =
      unitCost != null && Number.isFinite(Number(unitCost)) && Number(unitCost) >= 0
        ? Number(unitCost)
        : Number(ing.averageUnitCost) || Number(ing.unitCost) || 0;

    let totalStock;
    let moveCostAmount = 0;
    let moveExtendedValue = 0;
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const ingRow = await Ingredient.findOne({
          _id: ingredientId,
          organization: orgId,
        }).session(dbSession);
        if (!ingRow) {
          throw createHttpError(404, "Ingredient not found.");
        }
        const result = await stockBalanceService.applyQuantityDelta(
          locId,
          ingRow._id,
          qty,
          dbSession
        );
        totalStock = result.totalStock;
        if (uc > 0) {
          const costingResult = await inventoryCostService.addReceiveCost(
            ingRow._id,
            qty,
            uc,
            dbSession
          );
          moveCostAmount = costingResult.unitCost;
          moveExtendedValue = costingResult.totalCost;
        }
        await StockMovement.create(
          [
            {
              organization: orgId,
              ingredient: ingRow._id,
              delta: qty,
              balanceAfter: totalStock,
              reason: "customer_return",
              movementType: "refund",
              note: note != null ? String(note).slice(0, 500) : "",
              user: req.user?._id || null,
              location: locId,
              costAmount: moveCostAmount,
              extendedValue: moveExtendedValue,
            },
          ],
          { session: dbSession }
        );
      });
    } finally {
      dbSession.endSession();
    }

    try {
      await recordInventoryAudit({
        organizationId: orgId,
        action: "inventory.customer_return",
        sourceType: "ingredient",
        sourceId: ing._id,
        actorId: req.user?._id,
        metadata: {
          quantity: qty,
          locationId: String(locId),
        },
      });
    } catch {
      /* non-fatal */
    }

    emitPos(req, "inventory:updated", {
      ingredientIds: [String(ing._id)],
      at: Date.now(),
    });

    const fresh = await Ingredient.findById(ing._id);
    res.status(200).json({
      success: true,
      data: {
        ingredient: fresh,
        delta: qty,
        balanceAfter: totalStock,
        locationId: locId,
      },
    });
  } catch (e) {
    next(e);
  }
};

/** Create per-location rows from legacy `ingredient.currentStock` (idempotent). */
const bootstrapBalances = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const result =
      await stockBalanceService.ensureBalancesFromLegacyTotalsForOrg(orgId);
    res.status(200).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/**
 * Recipe-aware availability for menu items at a location (for POS “86” UX).
 * Query: `locationId` optional.
 */
const menuAvailability = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    let locId;
    try {
      locId = await stockBalanceService.resolveLocationIdOrDefaultForOrg(
        req.query.locationId,
        orgId
      );
    } catch {
      return res.status(200).json({
        success: true,
        data: {
          locationId: null,
          items: [],
          message: "No locations configured — add a Location first.",
        },
      });
    }

    const StockBalance = require("../models/stockBalanceModel");
    const balances = await StockBalance.find({ location: locId }).lean();
    const stockByIng = new Map(
      balances.map((b) => {
        const q = Number(b.quantity) || 0;
        const r = Number(b.reservedQty) || 0;
        return [String(b.ingredient), Math.max(0, q - r)];
      })
    );

    const miQ = { isAvailable: true };
    if (orgId) miQ.organization = orgId;
    const items = await MenuItem.find(miQ)
      .select("_id name inventoryImpact finishedGoodsIngredient")
      .lean();

    const demandResults = await Promise.all(
      items.map(async (mi) => {
        if (mi.inventoryImpact !== "stockable") {
          return { menuItemId: mi._id, name: mi.name, mode: "no_recipe", demand: [] };
        }
        try {
          const demand = await resolveStockableDemand(mi._id, 1, null);
          if (!demand.length) {
            return { menuItemId: mi._id, name: mi.name, mode: "no_recipe", demand: [] };
          }
          return { menuItemId: mi._id, name: mi.name, mode: "demand", demand };
        } catch (e) {
          return {
            menuItemId: mi._id,
            name: mi.name,
            mode: e.code === "CIRCULAR_RECIPE" ? "circular_recipe" : "bom_error",
            demand: [],
          };
        }
      })
    );

    const ingredientIds = [
      ...new Set(
        demandResults
          .flatMap((entry) => entry.demand || [])
          .map((entry) => String(entry.ingredientId))
          .filter(Boolean)
      ),
    ];
    const ingredientStatuses = new Map();
    if (ingredientIds.length > 0) {
      const ingDocs = await Ingredient.find({ _id: { $in: ingredientIds } })
        .select("status")
        .lean();
      for (const doc of ingDocs) {
        ingredientStatuses.set(String(doc._id), doc.status);
      }
    }

    const out = demandResults.map((entry) => {
      if (entry.mode === "no_recipe") {
        return {
          menuItemId: entry.menuItemId,
          name: entry.name,
          canFulfill: true,
          reason: "no_recipe",
        };
      }
      if (entry.mode === "circular_recipe" || entry.mode === "bom_error") {
        return {
          menuItemId: entry.menuItemId,
          name: entry.name,
          canFulfill: false,
          estimatedPortions: 0,
          reason: entry.mode,
        };
      }

      let portions = Infinity;
      let blocked = false;
      for (const { ingredientId, qty: need } of entry.demand) {
        if (need <= 0) continue;
        if (ingredientStatuses.get(String(ingredientId)) === "archived") {
          blocked = true;
          break;
        }
        const stock = stockByIng.has(String(ingredientId))
          ? stockByIng.get(String(ingredientId))
          : 0;
        portions = Math.min(portions, Math.floor(stock / need));
      }
      if (blocked) {
        return {
          menuItemId: entry.menuItemId,
          name: entry.name,
          canFulfill: false,
          estimatedPortions: 0,
          reason: "archived_ingredient",
        };
      }
      const canFulfill = portions === Infinity || portions > 0;
      return {
        menuItemId: entry.menuItemId,
        name: entry.name,
        canFulfill,
        estimatedPortions: portions === Infinity ? null : portions,
      };
    });

    res.status(200).json({
      success: true,
      data: { locationId: locId, items: out },
    });
  } catch (e) {
    next(e);
  }
};

const posInventoryPolicy = async (req, res, next) => {
  try {
    const { getInventorySettings } = require("../services/inventorySettingsService");
    const { assertTenantOrganization } = require("../utils/tenantOrg");
    const orgId = assertTenantOrganization(req);
    const s = await getInventorySettings(orgId);
    res.status(200).json({
      success: true,
      data: {
        strictOversell: !!s.strictOversell,
        stockDeductTrigger: s.stockDeductTrigger,
      },
    });
  } catch (e) {
    next(e);
  }
};

const wasteAnalytics = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { from, to, locationId } = req.query;
    const match = { reason: { $in: ["waste", "wastage"] }, organization: orgId };
    const fromDate = parseOptionalDate(from, "from");
    const toDate = parseOptionalDate(to, "to");
    const locationObjectId = parseOptionalObjectId(locationId, "locationId");
    if (fromDate || toDate) {
      match.createdAt = {};
      if (fromDate) match.createdAt.$gte = fromDate;
      if (toDate) match.createdAt.$lte = toDate;
    }
    if (locationObjectId) {
      match.location = locationObjectId;
    }

    const rows = await StockMovement.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            ingredient: "$ingredient",
            wasteReasonCode: {
              $ifNull: ["$wasteReasonCode", ""],
            },
          },
          totalDelta: { $sum: "$delta" },
          movements: { $sum: 1 },
          costTotal: { $sum: { $ifNull: ["$costAmount", 0] } },
        },
      },
      { $sort: { totalDelta: 1 } },
      { $limit: 500 },
    ]);

    const ingIds = [...new Set(rows.map((r) => r._id.ingredient).filter(Boolean))];
    const ings = await Ingredient.find({
      _id: { $in: ingIds },
      organization: orgId,
    })
      .select("name unit sku")
      .lean();
    const ingMap = new Map(ings.map((i) => [String(i._id), i]));

    const data = rows.map((r) => ({
      ingredientId: r._id.ingredient,
      ingredient: ingMap.get(String(r._id.ingredient)) || null,
      wasteReasonCode: r._id.wasteReasonCode || "",
      quantityDelta: r.totalDelta,
      movementCount: r.movements,
      costTotal: r.costTotal,
    }));

    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const listWastageEntries = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const from = parseOptionalDate(req.query.from, "from");
    const to = parseOptionalDate(req.query.to, "to");
    const ingredientObjectId = parseOptionalObjectId(
      req.query.ingredientId,
      "ingredientId"
    );
    const reason =
      req.query.reason != null ? String(req.query.reason).trim() : "";
    const filter = {
      organization: orgId,
      location: req.locationScopeId,
    };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }
    if (ingredientObjectId) filter.ingredient = ingredientObjectId;
    if (reason.length > 0) {
      if (!WASTAGE_REASONS.includes(reason)) {
        return next(
          createHttpError(
            400,
            `reason must be one of: ${WASTAGE_REASONS.join(", ")}.`
          )
        );
      }
      filter.reason = reason;
    }
    const pag = parsePaginationQuery(req.query);
    const [rows, total] = await Promise.all([
      WastageEntry.find(filter)
        .populate("ingredient", "name unit sku")
        .populate("location", "name code")
        .populate("createdBy", "name")
        .sort({ createdAt: -1 })
        .skip(pag.skip)
        .limit(pag.limit)
        .lean(),
      WastageEntry.countDocuments(filter),
    ]);
    return res.status(200).json({
      success: true,
      data: rows,
      page: pag.page,
      limit: pag.limit,
      total,
    });
  } catch (e) {
    next(e);
  }
};

const createWastageEntry = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { ingredientId, quantity, reason, notes } = req.body || {};
    if (!ingredientId || !mongoose.Types.ObjectId.isValid(String(ingredientId))) {
      return next(createHttpError(400, "Valid ingredientId is required."));
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return next(createHttpError(400, "quantity must be a positive number."));
    }
    const r = String(reason || "").trim();
    if (!WASTAGE_REASONS.includes(r)) {
      return next(
        createHttpError(400, `reason must be one of: ${WASTAGE_REASONS.join(", ")}.`)
      );
    }
    const locationId = req.locationScopeId;
    if (!locationId) {
      return next(createHttpError(400, "Location context required."));
    }
    const ingredient = await Ingredient.findOne({
      _id: ingredientId,
      organization: orgId,
      location: locationId,
    });
    if (!ingredient) {
      return next(createHttpError(404, "Ingredient not found in this branch."));
    }
    const unitCostAtEntry =
      Number(ingredient.averageUnitCost) > 0
        ? Number(ingredient.averageUnitCost)
        : Number(ingredient.unitCost) > 0
          ? Number(ingredient.unitCost)
          : 0;
    const totalCost = Number((qty * unitCostAtEntry).toFixed(2));

    let balanceAfter = 0;
    let createdEntry = null;
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const result = await stockBalanceService.applyQuantityDelta(
          locationId,
          ingredient._id,
          -qty,
          dbSession
        );
        balanceAfter = result.totalStock;
        const created = await WastageEntry.create(
          [
            {
              organization: orgId,
              ingredient: ingredient._id,
              location: locationId,
              quantity: qty,
              unit: String(ingredient.unit || ""),
              reason: r,
              notes: notes != null ? String(notes).trim().slice(0, 500) : "",
              createdBy: req.user?._id || null,
              unitCostAtEntry,
              totalCost,
            },
          ],
          { session: dbSession }
        );
        createdEntry = created[0];
        await StockMovement.create(
          [
            {
              organization: orgId,
              ingredient: ingredient._id,
              delta: -qty,
              balanceAfter,
              reason: "wastage",
              movementType: "wastage",
              note: notes != null ? String(notes).trim().slice(0, 500) : "",
              user: req.user?._id || null,
              location: locationId,
              wastageEntry: createdEntry._id,
              wasteReasonCode: r,
              costAmount: unitCostAtEntry,
              extendedValue: -totalCost,
            },
          ],
          { session: dbSession }
        );
      });
    } finally {
      dbSession.endSession();
    }

    const populated = await WastageEntry.findById(createdEntry._id)
      .populate("ingredient", "name unit sku")
      .populate("location", "name code")
      .populate("createdBy", "name")
      .lean();
    emitPos(req, "inventory:updated", {
      ingredientIds: [String(ingredient._id)],
      at: Date.now(),
    });
    if (balanceAfter <= Number(ingredient.reorderThreshold || 0)) {
      emitPos(req, "inventory:low-stock", {
        ingredientIds: [String(ingredient._id)],
      });
    }
    await logPosInventoryAudit(req, "wastage_recorded", {
      ingredientId: String(ingredient._id),
      wastageEntryId: String(createdEntry?._id || ""),
      quantity: qty,
      reason: r,
      totalCost,
      locationId: String(locationId),
    });
    return res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (e) {
    next(e);
  }
};

const wastageReport = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const from = parseOptionalDate(req.query.from, "from");
    const to = parseOptionalDate(req.query.to, "to");
    const filter = {
      organization: new mongoose.Types.ObjectId(String(orgId)),
      location: new mongoose.Types.ObjectId(String(req.locationScopeId)),
    };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }
    const rows = await WastageEntry.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$reason",
          totalQuantity: { $sum: "$quantity" },
          totalWasteCost: { $sum: "$totalCost" },
          entryCount: { $sum: 1 },
        },
      },
      { $sort: { totalWasteCost: -1 } },
    ]);
    return res.status(200).json({
      success: true,
      data: rows.map((row) => ({
        reason: row._id,
        totalQuantity: row.totalQuantity,
        totalWasteCost: row.totalWasteCost,
        entryCount: row.entryCount,
      })),
    });
  } catch (e) {
    next(e);
  }
};

const priceHistory = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { ingredientId, limit } = req.query;
    const q = { organization: orgId };
    if (ingredientId && mongoose.Types.ObjectId.isValid(String(ingredientId))) {
      const ingOk = await Ingredient.exists({
        _id: ingredientId,
        organization: orgId,
      });
      if (!ingOk) {
        return next(createHttpError(404, "Ingredient not found."));
      }
      q.ingredient = ingredientId;
    }
    const rawLimit = Number(limit);
    if (limit != null && (!Number.isFinite(rawLimit) || rawLimit <= 0)) {
      return next(createHttpError(400, "limit must be a positive number."));
    }
    const lim = Math.min(rawLimit || 200, 500);
    const rows = await IngredientPriceHistory.find(q)
      .sort({ createdAt: -1 })
      .limit(lim)
      .populate("ingredient", "name unit sku")
      .lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const runInventoryAlerts = async (req, res, next) => {
  try {
    const { runInventoryAlertsOnce } = require("../services/inventoryAlertService");
    const out = await runInventoryAlertsOnce();
    res.status(200).json({ success: true, data: out });
  } catch (e) {
    next(e);
  }
};

const valuationReport = async (req, res, next) => {
  try {
    const { buildValuationReport } = require("../services/inventoryService");
    const orgId = assertTenantOrganization(req);
    const { locationId, costMethod } = req.query;
    if (
      locationId != null &&
      locationId !== "" &&
      !mongoose.Types.ObjectId.isValid(String(locationId))
    ) {
      return next(createHttpError(400, "Invalid locationId."));
    }
    if (
      costMethod != null &&
      costMethod !== "" &&
      !["weighted_average", "fifo", "lifo", "standard"].includes(String(costMethod))
    ) {
      return next(
        createHttpError(
          400,
          "Invalid costMethod. Use weighted_average, fifo, lifo, or standard."
        )
      );
    }
    const data = await buildValuationReport(orgId, { locationId, costMethod });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const slowMovingReport = async (req, res, next) => {
  try {
    const { buildSlowMovingReport } = require("../services/inventoryService");
    const orgId = assertTenantOrganization(req);
    const { days } = req.query;
    if (days != null && days !== "") {
      const parsed = Number(days);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 3650) {
        return next(
          createHttpError(400, "days must be an integer between 1 and 3650.")
        );
      }
    }
    const data = await buildSlowMovingReport(orgId, { days: Number(days) || 30 });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const barcodeScan = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const barcode = parseBarcode(req.params.barcode);

    // 1. Search in Ingredients
    let ingredient = await Ingredient.findOne({ organization: orgId, sku: barcode }).lean();
    if (ingredient) {
      const balances = await mongoose.model("StockBalance").find({ ingredient: ingredient._id }).populate("location", "name").lean();
      return res.status(200).json({
        success: true,
        type: "ingredient",
        data: { ...ingredient, balances }
      });
    }

    // 2. Search in MenuItemVariants
    let variant = await MenuItemVariant.findOne({ organization: orgId, sku: barcode }).populate("menuItem").lean();
    if (variant) {
      return res.status(200).json({
        success: true,
        type: "menu_item_variant",
        data: variant
      });
    }

    return next(createHttpError(404, "No item found for this barcode"));
  } catch (e) {
    next(e);
  }
};

const forecastReport = async (req, res, next) => {
  try {
    const { calculateForecast } = require("../services/inventoryForecastService");
    const orgId = assertTenantOrganization(req);
    const data = await calculateForecast(orgId);
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  lowStock,
  report,
  movements,
  adjust,
  customerReturn,
  bootstrapBalances,
  menuAvailability,
  wasteAnalytics,
  listWastageEntries,
  createWastageEntry,
  wastageReport,
  priceHistory,
  runInventoryAlerts,
  posInventoryPolicy,
  valuationReport,
  slowMovingReport,
  barcodeScan,
  forecastReport,
};
