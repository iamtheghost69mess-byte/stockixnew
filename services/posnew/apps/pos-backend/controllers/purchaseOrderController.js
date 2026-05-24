const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const PurchaseOrder = require("../models/purchaseOrderModel");
const StockBalance = require("../models/stockBalanceModel");
const Supplier = require("../models/supplierModel");
const Location = require("../models/locationModel");
const Ingredient = require("../models/ingredientModel");
const StockMovement = require("../models/stockMovementModel");
const IngredientPriceHistory = require("../models/ingredientPriceHistoryModel");
const stockBalanceService = require("../services/stockBalanceService");
const inventoryCostService = require("../services/inventoryCostService");
const stockLotService = require("../services/stockLotService");
const { emitPos } = require("../utils/socketEmit");
const { assertTenantOrganization } = require("../utils/tenantOrg");
const { parsePaginationQuery } = require("../utils/listPagination");

/**
 * GET ?locationId= — ingredients where available (qty − reserved) < reorderThreshold.
 */
const listReorderSuggestions = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { locationId } = req.query;
    const lid = await stockBalanceService.resolveLocationIdOrDefaultForOrg(
      locationId,
      orgId
    );
    const balances = await StockBalance.find({ location: lid })
      .populate("ingredient")
      .lean();
    const out = [];
    for (const b of balances) {
      const ing = b.ingredient;
      if (!ing || String(ing.status || "active") === "archived") continue;
      const q = Number(b.quantity) || 0;
      const r = Number(b.reservedQty) || 0;
      const avail = Math.max(0, q - r);
      const th = Number(ing.reorderThreshold) || 0;
      if (avail >= th) continue;
      const ro = Math.max(0, Number(ing.reorderQuantity) || 0);
      const suggestedQty =
        ro > 0 ? ro : Math.max(th - avail, 1);
      out.push({
        ingredientId: ing._id,
        ingredient: { _id: ing._id, name: ing.name, unit: ing.unit, sku: ing.sku },
        availableQty: avail,
        reorderThreshold: th,
        suggestedQty,
      });
    }
    out.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name));
    res.status(200).json({ success: true, data: out });
  } catch (e) {
    next(e);
  }
};

/**
 * POST body: { locationId, supplier } — draft PO with one line per below-threshold ingredient.
 */
const createDraftFromSuggestions = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { location, supplier } = req.body;
    if (!location || !mongoose.Types.ObjectId.isValid(location)) {
      return next(createHttpError(400, "Valid location is required."));
    }
    if (!supplier || !mongoose.Types.ObjectId.isValid(supplier)) {
      return next(createHttpError(400, "Valid supplier is required."));
    }
    const sup = await Supplier.findOne({
      _id: supplier,
      organization: orgId,
    });
    if (!sup) return next(createHttpError(404, "Supplier not found."));
    const loc = await Location.findOne({
      _id: location,
      organization: orgId,
    });
    if (!loc) return next(createHttpError(404, "Location not found."));

    const lid = await stockBalanceService.resolveLocationIdOrDefaultForOrg(
      location,
      orgId
    );
    const balances = await StockBalance.find({ location: lid })
      .populate("ingredient")
      .lean();
    const normLines = [];
    for (const b of balances) {
      const ing = b.ingredient;
      if (!ing || String(ing.status || "active") === "archived") continue;
      const q = Number(b.quantity) || 0;
      const r = Number(b.reservedQty) || 0;
      const avail = Math.max(0, q - r);
      const th = Number(ing.reorderThreshold) || 0;
      if (avail >= th) continue;
      const ro = Math.max(0, Number(ing.reorderQuantity) || 0);
      const suggestedQty =
        ro > 0 ? ro : Math.max(th - avail, 1);
      const uc = Math.max(0, Number(ing.unitCost) || 0);
      normLines.push({
        ingredient: ing._id,
        description: "",
        quantityOrdered: suggestedQty,
        quantityReceived: 0,
        unitCost: uc,
      });
    }
    if (!normLines.length) {
      return next(
        createHttpError(400, "No ingredients are below reorder threshold at this location.")
      );
    }

    const doc = await PurchaseOrder.create({
      organization: orgId,
      reference: `suggest-${Date.now()}`,
      supplier,
      location,
      status: "draft",
      lines: normLines,
    });
    const populated = await PurchaseOrder.findById(doc._id)
      .populate("supplier", "name")
      .populate("location", "name")
      .populate("lines.ingredient", "name unit");
    res.status(201).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

const listPurchaseOrders = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { status, supplierId, locationId, q: searchQuery, sortBy, sortDir } = req.query;
    const query = { organization: orgId };
    if (status) query.status = status;
    if (supplierId && mongoose.Types.ObjectId.isValid(supplierId)) {
      query.supplier = supplierId;
    }
    if (locationId && mongoose.Types.ObjectId.isValid(locationId)) {
      query.location = locationId;
    }
    if (typeof searchQuery === "string" && searchQuery.trim()) {
      const rx = new RegExp(searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ reference: rx }, { notes: rx }, { rfqReference: rx }, { supplierInvoiceRef: rx }];
    }
    const pag = parsePaginationQuery(req.query);
    const sortable = new Set(["createdAt", "status", "reference"]);
    const sortKey = sortable.has(String(sortBy || "")) ? String(sortBy) : "createdAt";
    const dir = String(sortDir || "").toLowerCase() === "asc" ? 1 : -1;
    const base = PurchaseOrder.find(query)
      .populate("supplier", "name code")
      .populate("location", "name code")
      .sort({ [sortKey]: dir, _id: -1 });
    if (pag.active) {
      const [rows, total] = await Promise.all([
        base.clone().skip(pag.skip).limit(pag.limit).lean(),
        PurchaseOrder.countDocuments(query),
      ]);
      return res.status(200).json({
        success: true,
        data: rows,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }
    const rows = await base.lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const getPurchaseOrder = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await PurchaseOrder.findOne({
      _id: id,
      organization: orgId,
    })
      .populate("supplier")
      .populate("location")
      .populate("lines.ingredient", "name unit sku");
    if (!doc) return next(createHttpError(404, "Not found"));
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const createPurchaseOrder = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { supplier, location, lines, expectedAt, notes, reference } =
      req.body;
    if (!supplier || !mongoose.Types.ObjectId.isValid(supplier)) {
      return next(createHttpError(400, "Valid supplier is required."));
    }
    if (!location || !mongoose.Types.ObjectId.isValid(location)) {
      return next(createHttpError(400, "Valid location is required."));
    }
    const sup = await Supplier.findOne({ _id: supplier, organization: orgId });
    if (!sup) return next(createHttpError(404, "Supplier not found."));
    const loc = await Location.findOne({ _id: location, organization: orgId });
    if (!loc) return next(createHttpError(404, "Location not found."));

    const normLines = [];
    if (Array.isArray(lines)) {
      for (const row of lines) {
        if (!row.ingredient || !mongoose.Types.ObjectId.isValid(row.ingredient)) {
          return next(createHttpError(400, "Each line needs ingredient."));
        }
        const ing = await Ingredient.findOne({
          _id: row.ingredient,
          organization: orgId,
        });
        if (!ing) return next(createHttpError(400, "Ingredient not found."));
        const qo = Number(row.quantityOrdered);
        if (Number.isNaN(qo) || qo <= 0) {
          return next(createHttpError(400, "quantityOrdered must be positive."));
        }
        normLines.push({
          ingredient: row.ingredient,
          description: row.description != null ? String(row.description) : "",
          quantityOrdered: qo,
          quantityReceived: 0,
          unitCost: Math.max(0, Number(row.unitCost) || 0),
        });
      }
    }

    const doc = await PurchaseOrder.create({
      organization: orgId,
      reference: reference != null ? String(reference).slice(0, 64) : "",
      supplier,
      location,
      status: "draft",
      expectedAt: expectedAt ? new Date(expectedAt) : null,
      notes: notes != null ? String(notes).slice(0, 2000) : "",
      lines: normLines,
    });
    const populated = await PurchaseOrder.findById(doc._id)
      .populate("supplier", "name")
      .populate("location", "name")
      .populate("lines.ingredient", "name unit");
    res.status(201).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

const patchPurchaseOrder = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await PurchaseOrder.findOne({
      _id: id,
      organization: orgId,
    });
    if (!doc) return next(createHttpError(404, "Not found"));
    if (["received", "cancelled"].includes(doc.status)) {
      return next(createHttpError(400, "Cannot edit closed purchase order."));
    }
    const { expectedAt, notes, reference, supplierInvoiceRef, lines } =
      req.body;
    if (expectedAt !== undefined) {
      doc.expectedAt = expectedAt ? new Date(expectedAt) : null;
    }
    if (notes !== undefined) doc.notes = String(notes).slice(0, 2000);
    if (reference !== undefined) doc.reference = String(reference).slice(0, 64);
    if (supplierInvoiceRef !== undefined) {
      doc.supplierInvoiceRef = String(supplierInvoiceRef).slice(0, 128);
    }
    if (Array.isArray(lines) && doc.status === "draft") {
      const normLines = [];
      for (const row of lines) {
        if (!row.ingredient || !mongoose.Types.ObjectId.isValid(row.ingredient)) {
          return next(createHttpError(400, "Each line needs ingredient."));
        }
        const ingOk = await Ingredient.exists({
          _id: row.ingredient,
          organization: orgId,
        });
        if (!ingOk) {
          return next(createHttpError(400, "Ingredient not found."));
        }
        const qo = Number(row.quantityOrdered);
        if (Number.isNaN(qo) || qo <= 0) {
          return next(createHttpError(400, "quantityOrdered must be positive."));
        }
        normLines.push({
          ingredient: row.ingredient,
          description: row.description != null ? String(row.description) : "",
          quantityOrdered: qo,
          quantityReceived: 0,
          unitCost: Math.max(0, Number(row.unitCost) || 0),
        });
      }
      doc.lines = normLines;
    }
    await doc.save();
    const populated = await PurchaseOrder.findById(doc._id)
      .populate("supplier", "name")
      .populate("location", "name")
      .populate("lines.ingredient", "name unit");
    res.status(200).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

const confirmPurchaseOrder = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await PurchaseOrder.findOne({
      _id: id,
      organization: orgId,
    });
    if (!doc) return next(createHttpError(404, "Not found"));
    if (doc.status !== "draft") {
      return next(createHttpError(400, "Only draft POs can be confirmed."));
    }
    if (!doc.lines.length) {
      return next(createHttpError(400, "Add lines before confirming."));
    }
    doc.status = "confirmed";
    await doc.save();

    const locId = String(doc.location);
    for (const line of doc.lines) {
      const qo = Number(line.quantityOrdered) || 0;
      if (qo > 0) {
        await stockBalanceService.applyIncomingDelta(
          locId,
          line.ingredient,
          qo
        );
      }
    }

    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const cancelPurchaseOrder = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await PurchaseOrder.findOne({
      _id: id,
      organization: orgId,
    });
    if (!doc) return next(createHttpError(404, "Not found"));
    if (doc.status === "received") {
      return next(createHttpError(400, "Cannot cancel a fully received PO."));
    }
    const prev = doc.status;
    if (prev === "confirmed" || prev === "partial") {
      const locId = String(doc.location);
      for (const line of doc.lines) {
        const ordered = Number(line.quantityOrdered) || 0;
        const recv = Number(line.quantityReceived) || 0;
        const stillIncoming = Math.max(0, ordered - recv);
        if (stillIncoming > 0) {
          await stockBalanceService.applyIncomingDelta(
            locId,
            line.ingredient,
            -stillIncoming
          );
        }
      }
    }
    doc.status = "cancelled";
    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

/**
 * Body: { receives: [ { lineId, quantity, unitCost?, lotNumber?, expiryDate?, productionDate?, supplierBatchRef? } ] }
 */
const grnService = require("../services/grnService");

const receivePurchaseOrder = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    // Phase 3: Direct receipt is deprecated. This route now creates a draft GRN.
    const grn = await grnService.createGRNFromPO(id, orgId, req.user?._id);
    res.status(201).json({
      success: true,
      message: "Draft GRN created. Please confirm the GRN to complete receipt.",
      data: grn,
    });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listPurchaseOrders,
  listReorderSuggestions,
  createDraftFromSuggestions,
  getPurchaseOrder,
  createPurchaseOrder,
  patchPurchaseOrder,
  confirmPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
};
