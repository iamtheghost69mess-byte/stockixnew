const mongoose = require("mongoose");
const createHttpError = require("http-errors");
const Location = require("../models/locationModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const { assertTenantOrganization } = require("../utils/tenantOrg");
const { assertLocationCreateAllowed } = require("../services/entitlementService");
const { bootstrapBranchAccounts } = require("../services/accountingService");
const RbacConfig = require("../models/rbacConfigModel");
const defaultRbacRoles = require("../constants/defaultRbacRoles");
const {
  buildRolesFromConfigDoc,
  loadConfigDoc,
  invalidateRbacCache,
} = require("../services/rbacService");

const RECEIPT_PRINT_PERM = "pos.receipt.print";

/**
 * Keeps waiter `pos.receipt.print` in RBAC aligned with `Location.waiterCanPrintReceipt`.
 * @param {import("mongoose").Types.ObjectId | string} organizationId
 * @param {boolean} enabled
 */
async function syncWaiterReceiptPrintPermission(organizationId, enabled) {
  const orgOid =
    organizationId instanceof mongoose.Types.ObjectId
      ? organizationId
      : new mongoose.Types.ObjectId(String(organizationId));
  await loadConfigDoc(orgOid);
  const doc = await RbacConfig.findOne({ organization: orgOid }).lean();
  const merged = buildRolesFromConfigDoc(doc);
  const waiterRole = merged.waiter || { can: [...defaultRbacRoles.waiter.can] };
  const nextCan = [...(waiterRole.can || [])];
  if (enabled) {
    if (!nextCan.includes(RECEIPT_PRINT_PERM)) nextCan.push(RECEIPT_PRINT_PERM);
  } else {
    const ix = nextCan.indexOf(RECEIPT_PRINT_PERM);
    if (ix >= 0) nextCan.splice(ix, 1);
  }
  const waiterPayload = { can: nextCan };
  if (Array.isArray(waiterRole.inherits) && waiterRole.inherits.length > 0) {
    waiterPayload.inherits = [...waiterRole.inherits];
  }
  await RbacConfig.updateOne(
    { organization: orgOid },
    { $set: { "builtinOverrides.waiter": waiterPayload } }
  );
  invalidateRbacCache(orgOid);
}

function normalizeCode(code) {
  return code != null ? String(code).trim().toUpperCase() : "";
}

function receiptSurfaceFromDoc(doc = {}) {
  return {
    receiptLogo: doc.receiptLogo != null ? String(doc.receiptLogo).trim() : "",
    receiptHeader: doc.receiptHeader != null ? String(doc.receiptHeader).trim() : "",
    receiptFooter: doc.receiptFooter != null ? String(doc.receiptFooter).trim() : "",
    receiptShowVAT: doc.receiptShowVAT !== false,
    receiptShowServiceCharge: doc.receiptShowServiceCharge !== false,
  };
}

function normalizeReceiptConfig(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  return {
    headerLine1:
      src.headerLine1 != null ? String(src.headerLine1).trim().slice(0, 120) : "",
    headerLine2:
      src.headerLine2 != null ? String(src.headerLine2).trim().slice(0, 120) : "",
    footerLine:
      src.footerLine != null
        ? String(src.footerLine).trim().slice(0, 160)
        : "Thank you",
    showBranchName:
      src.showBranchName !== undefined ? Boolean(src.showBranchName) : true,
    showBranchAddress:
      src.showBranchAddress !== undefined ? Boolean(src.showBranchAddress) : true,
    showBranchPhone:
      src.showBranchPhone !== undefined ? Boolean(src.showBranchPhone) : false,
    showTaxVatNumber:
      src.showTaxVatNumber !== undefined ? Boolean(src.showTaxVatNumber) : false,
  };
}

const listLocations = async (req, res, next) => {
  try {
    const tenantOrgId = req.tenantOrganizationId;
    if (!tenantOrgId) {
      return next(
        createHttpError(403, "Organization is required to list locations.")
      );
    }
    const filter = { organization: tenantOrgId };
    const pag = parsePaginationQuery(req.query);
    const base = Location.find(filter).sort({ name: 1 });

    if (pag.active) {
      const [rows, total] = await Promise.all([
        base.clone().skip(pag.skip).limit(pag.limit),
        Location.countDocuments(filter),
      ]);
      return res.status(200).json({
        success: true,
        data: rows,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }

    const rows = await base;
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const createLocation = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const {
      name,
      code,
      address,
      waiterCanPrintReceipt,
      vatRate,
      vatInclusive,
      kitchenWorkflowEnabled,
      discountReasonRequired,
    } = req.body;
    if (!name || !String(name).trim()) {
      return next(createHttpError(400, "Name is required."));
    }
    try {
      await assertLocationCreateAllowed(orgId);
    } catch (e) {
      const status = e && e.status;
      if (status === 403 || status === 404) {
        return next(createHttpError(status, e.message));
      }
      throw e;
    }
    const doc = await Location.create({
      organization: orgId,
      name: String(name).trim(),
      code: normalizeCode(code),
      address: address != null ? String(address).trim() : "",
      waiterCanPrintReceipt:
        waiterCanPrintReceipt !== undefined
          ? Boolean(waiterCanPrintReceipt)
          : false,
      vatRate:
        vatRate !== undefined && Number.isFinite(Number(vatRate))
          ? Math.min(100, Math.max(0, Number(vatRate)))
          : 0,
      vatInclusive: vatInclusive !== undefined ? Boolean(vatInclusive) : false,
      kitchenWorkflowEnabled:
        kitchenWorkflowEnabled !== undefined
          ? Boolean(kitchenWorkflowEnabled)
          : true,
      discountReasonRequired:
        discountReasonRequired !== undefined
          ? Boolean(discountReasonRequired)
          : true,
    });
    try {
      await bootstrapBranchAccounts(doc._id, orgId);
    } catch (bootstrapError) {
      await Location.deleteOne({ _id: doc._id, organization: orgId });
      throw bootstrapError;
    }
    if (doc.waiterCanPrintReceipt) {
      try {
        await syncWaiterReceiptPrintPermission(orgId, true);
      } catch {
        /* non-fatal RBAC sync */
      }
    }
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    if (e && e.code === 11000) {
      return next(
        createHttpError(
          400,
          "A branch with this name or code already exists for your organization.",
        ),
      );
    }
    next(e);
  }
};

const updateLocation = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!id || !/^[a-fA-F0-9]{24}$/.test(String(id))) {
      return next(createHttpError(400, "Invalid location id."));
    }
    const {
      name,
      code,
      address,
      waiterCanPrintReceipt,
      vatRate,
      vatInclusive,
      kitchenWorkflowEnabled,
      discountReasonRequired,
    } = req.body || {};
    if (!name || !String(name).trim()) {
      return next(createHttpError(400, "Name is required."));
    }
    const prevLoc = await Location.findOne({ _id: id, organization: orgId })
      .select("waiterCanPrintReceipt")
      .lean();
    const locationPatch = {
      name: String(name).trim(),
      code: normalizeCode(code),
      address: address != null ? String(address).trim() : "",
    };
    if (waiterCanPrintReceipt !== undefined) {
      locationPatch.waiterCanPrintReceipt = Boolean(waiterCanPrintReceipt);
    }
    if (vatRate !== undefined && Number.isFinite(Number(vatRate))) {
      locationPatch.vatRate = Math.min(100, Math.max(0, Number(vatRate)));
    }
    if (vatInclusive !== undefined) {
      locationPatch.vatInclusive = Boolean(vatInclusive);
    }
    if (kitchenWorkflowEnabled !== undefined) {
      locationPatch.kitchenWorkflowEnabled = Boolean(kitchenWorkflowEnabled);
    }
    if (discountReasonRequired !== undefined) {
      locationPatch.discountReasonRequired = Boolean(discountReasonRequired);
    }
    const doc = await Location.findOneAndUpdate(
      { _id: id, organization: orgId },
      { $set: locationPatch },
      { new: true }
    );
    if (!doc) {
      return next(createHttpError(404, "Location not found."));
    }
    if (waiterCanPrintReceipt !== undefined) {
      const prevVal = Boolean(prevLoc?.waiterCanPrintReceipt);
      const nextVal = Boolean(doc.waiterCanPrintReceipt);
      if (nextVal !== prevVal) {
        try {
          await syncWaiterReceiptPrintPermission(orgId, nextVal);
        } catch {
          /* non-fatal RBAC sync */
        }
      }
    }
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    if (e && e.code === 11000) {
      return next(
        createHttpError(
          400,
          "A branch with this name or code already exists for your organization.",
        ),
      );
    }
    next(e);
  }
};

const getReceiptConfig = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const locationId = req.locationScopeId;
    if (!locationId) {
      return next(createHttpError(400, "Location context required."));
    }
    const doc = await Location.findOne({
      _id: locationId,
      organization: orgId,
    })
      .select(
        "name code address phone taxVatNumber receiptConfig receiptLogo receiptHeader receiptFooter receiptShowVAT receiptShowServiceCharge"
      )
      .lean();
    if (!doc) {
      return next(createHttpError(404, "Location not found."));
    }
    return res.status(200).json({
      success: true,
      data: {
        locationId: String(doc._id),
        locationName: doc.name || "",
        locationCode: doc.code || "",
        locationAddress: doc.address || "",
        locationPhone: doc.phone || "",
        locationTaxVatNumber: doc.taxVatNumber || "",
        receiptConfig: normalizeReceiptConfig(doc.receiptConfig || {}),
        ...receiptSurfaceFromDoc(doc),
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateReceiptConfig = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const locationId = req.locationScopeId;
    if (!locationId) {
      return next(createHttpError(400, "Location context required."));
    }
    const set = {};
    if (req.body?.receiptConfig !== undefined) {
      set.receiptConfig = normalizeReceiptConfig(req.body.receiptConfig);
    }
    const b = req.body || {};
    if (b.receiptLogo !== undefined) {
      set.receiptLogo = String(b.receiptLogo).trim().slice(0, 2000);
    }
    if (b.receiptHeader !== undefined) {
      set.receiptHeader = String(b.receiptHeader).trim().slice(0, 2000);
    }
    if (b.receiptFooter !== undefined) {
      set.receiptFooter = String(b.receiptFooter).trim().slice(0, 2000);
    }
    if (b.receiptShowVAT !== undefined) {
      set.receiptShowVAT = Boolean(b.receiptShowVAT);
    }
    if (b.receiptShowServiceCharge !== undefined) {
      set.receiptShowServiceCharge = Boolean(b.receiptShowServiceCharge);
    }
    if (Object.keys(set).length === 0) {
      return next(createHttpError(400, "No receipt fields to update."));
    }
    const doc = await Location.findOneAndUpdate(
      { _id: locationId, organization: orgId },
      { $set: set },
      { new: true }
    )
      .select(
        "name code address phone taxVatNumber receiptConfig receiptLogo receiptHeader receiptFooter receiptShowVAT receiptShowServiceCharge"
      )
      .lean();
    if (!doc) {
      return next(createHttpError(404, "Location not found."));
    }
    return res.status(200).json({
      success: true,
      data: {
        locationId: String(doc._id),
        locationName: doc.name || "",
        locationCode: doc.code || "",
        locationAddress: doc.address || "",
        locationPhone: doc.phone || "",
        locationTaxVatNumber: doc.taxVatNumber || "",
        receiptConfig: normalizeReceiptConfig(doc.receiptConfig || {}),
        ...receiptSurfaceFromDoc(doc),
      },
    });
  } catch (error) {
    next(error);
  }
};

const deleteLocation = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!id || !/^[a-fA-F0-9]{24}$/.test(String(id))) {
      return next(createHttpError(400, "Invalid location id."));
    }

    // Dependency checks
    const [hasStock, hasOrders] = await Promise.all([
      mongoose.model("StockBalance").exists({ location: id, organization: orgId }),
      mongoose.model("Order").exists({ location: id, organization: orgId }),
    ]);

    if (hasStock) {
      return next(createHttpError(400, "Cannot delete location with existing stock balances. Transfer stock first."));
    }
    if (hasOrders) {
      return next(createHttpError(400, "Cannot delete location referenced by orders."));
    }

    const doc = await Location.findOneAndDelete({ _id: id, organization: orgId });
    if (!doc) {
      return next(createHttpError(404, "Location not found."));
    }
    res.status(200).json({ success: true, message: "Location deleted." });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  getReceiptConfig,
  updateReceiptConfig,
};
