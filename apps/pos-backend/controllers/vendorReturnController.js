const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const VendorReturn = require("../models/vendorReturnModel");
const StockBalance = require("../models/stockBalanceModel");
const Ingredient = require("../models/ingredientModel");
const StockMovement = require("../models/stockMovementModel");
const Supplier = require("../models/supplierModel");
const Location = require("../models/locationModel");
const inventoryCostService = require("../services/inventoryCostService");
const stockBalanceService = require("../services/stockBalanceService");
const accountingService = require("../services/accountingService");
const { recordInventoryAudit } = require("../services/inventoryAuditService");
const { assertTenantOrganization } = require("../utils/tenantOrg");

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Human-readable unique-ish number per org (compound unique with organization).
 * @returns {string}
 */
function allocateVendorReturnNumber() {
  return `RTV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

const createReturn = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const supplierId = body.supplier ?? body.supplierId;
    const locationId = body.location ?? body.locationId;
    const returnNumberInput =
      body.returnNumber != null && String(body.returnNumber).trim()
        ? String(body.returnNumber).trim().slice(0, 64)
        : "";
    const vendorBillRaw = body.vendorBill ?? body.vendorBillId;
    const notes = body.notes != null ? String(body.notes).slice(0, 2000) : "";

    if (!supplierId || !mongoose.Types.ObjectId.isValid(String(supplierId))) {
      return next(createHttpError(400, "Valid supplier is required."));
    }
    if (!locationId || !mongoose.Types.ObjectId.isValid(String(locationId))) {
      return next(createHttpError(400, "Valid location is required."));
    }

    const sup = await Supplier.findOne({ _id: supplierId, organization: orgId });
    if (!sup) return next(createHttpError(404, "Supplier not found."));
    const loc = await Location.findOne({ _id: locationId, organization: orgId });
    if (!loc) return next(createHttpError(404, "Location not found."));

    let returnNumber = returnNumberInput || allocateVendorReturnNumber();

    let returnDate = new Date();
    if (body.returnDate) {
      const parsed = new Date(body.returnDate);
      if (!Number.isNaN(parsed.getTime())) returnDate = parsed;
    }

    let vendorBill = null;
    if (vendorBillRaw && mongoose.Types.ObjectId.isValid(String(vendorBillRaw))) {
      vendorBill = vendorBillRaw;
    }

    const createDoc = async () =>
      VendorReturn.create({
        organization: orgId,
        supplier: supplierId,
        location: locationId,
        returnNumber,
        notes,
        vendorBill,
        returnDate,
        createdBy: req.user?._id,
        status: "draft",
      });

    let doc;
    try {
      doc = await createDoc();
    } catch (e) {
      if (e && e.code === 11000 && !returnNumberInput) {
        returnNumber = allocateVendorReturnNumber();
        doc = await createDoc();
      } else {
        throw e;
      }
    }

    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const getReturn = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const doc = await VendorReturn.findOne({ _id: req.params.id, organization: orgId })
      .populate("supplier", "name")
      .populate("location", "name")
      .populate("lines.ingredient", "name unit sku");

    if (!doc) return next(createHttpError(404, "Not found"));
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const listReturns = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { status, supplier, supplierId } = req.query;
    const q = { organization: orgId };
    if (status) q.status = status;
    const supplierFilter = supplier || supplierId;
    if (supplierFilter) q.supplier = supplierFilter;

    const rows = await VendorReturn.find(q)
      .populate("supplier", "name")
      .populate("location", "name")
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const { QUALITY_GRADES } = VendorReturn;
const QUALITY_GRADE_SET = new Set(QUALITY_GRADES);

const sanitizeLine = (raw) => {
  const line = {
    ingredient: raw.ingredient,
    quantity: Number(raw.quantity) || 0,
    unitCost: Number(raw.unitCost) || 0,
    reason: typeof raw.reason === "string" ? raw.reason.trim().slice(0, 500) : "",
    qualityGrade: QUALITY_GRADE_SET.has(raw.qualityGrade) ? raw.qualityGrade : "other",
  };
  return line;
};

const updateLines = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const doc = await VendorReturn.findOne({ _id: req.params.id, organization: orgId });
    if (!doc) return next(createHttpError(404, "Not found"));
    if (doc.status !== "draft") {
      return next(createHttpError(400, "Can only update draft returns."));
    }
    if (!Array.isArray(req.body.lines)) {
      return next(createHttpError(400, "lines must be an array."));
    }

    for (const raw of req.body.lines) {
      if (raw?.qualityGrade && !QUALITY_GRADE_SET.has(raw.qualityGrade)) {
        return next(
          createHttpError(
            400,
            `qualityGrade must be one of: ${QUALITY_GRADES.join(", ")}`
          )
        );
      }
      if (!raw?.ingredient || !mongoose.Types.ObjectId.isValid(raw.ingredient)) {
        return next(createHttpError(400, "Each line requires a valid ingredient id."));
      }
    }

    doc.lines = req.body.lines.map(sanitizeLine);
    await doc.save();

    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const postReturn = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const doc = await VendorReturn.findOne({ _id: req.params.id, organization: orgId });
    if (!doc) return next(createHttpError(404, "Not found"));
    if (doc.status !== "draft") {
      return next(createHttpError(400, "Already processed."));
    }

    const locId = String(doc.location);
    const touched = [];

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        let grandTotal = 0;
        for (const line of doc.lines) {
          const qty = Number(line.quantity) || 0;
          if (qty <= 0) continue;

          const ing = await Ingredient.findById(line.ingredient).session(session);
          if (!ing) continue;

          const { totalCost } = await inventoryCostService.consumeIngredientCost(ing._id, qty, session);
          grandTotal = round2(grandTotal + totalCost);
          const unitCost =
            qty > 0 ? totalCost / qty : Number(ing.averageUnitCost) || Number(ing.unitCost) || 0;

          const result = await stockBalanceService.applyQuantityDelta(locId, ing._id, -qty, session);

          await StockMovement.create(
            [
              {
                organization: orgId,
                ingredient: ing._id,
                delta: -qty,
                balanceAfter: result.totalStock,
                reason: "vendor_return",
                note: `RTV ${doc.returnNumber}`,
                user: req.user?._id,
                location: locId,
                costAmount: unitCost,
                extendedValue: -totalCost,
                isRestockable: false,
                qualityStatus: "passed",
              },
            ],
            { session },
          );

          touched.push(String(ing._id));
        }

        const entry = await accountingService.postVendorReturnGl({
          vendorReturnId: doc._id,
          organizationId: orgId,
          totalCost: grandTotal,
          returnDate: doc.returnDate,
          returnNumber: doc.returnNumber,
          userId: req.user?._id,
          locationId: doc.location,
          session,
        });

        doc.status = "confirmed";
        if (entry && entry._id) {
          doc.journalEntry = entry._id;
        }
        await doc.save({ session });
      });
    } finally {
      session.endSession();
    }

    const fresh = await VendorReturn.findById(doc._id)
      .populate("supplier", "name")
      .populate("lines.ingredient", "name sku");

    try {
      await recordInventoryAudit({
        organizationId: orgId,
        action: "inventory.vendor_return_posted",
        sourceType: "vendor_return",
        sourceId: doc._id,
        actorId: req.user?._id,
        metadata: {
          returnNumber: doc.returnNumber || null,
          lineCount: doc.lines.filter((l) => Number(l.quantity) > 0).length,
        },
      });
    } catch {
      /* non-fatal */
    }

    res.status(200).json({ success: true, data: fresh });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  createReturn,
  getReturn,
  listReturns,
  updateLines,
  postReturn,
};
