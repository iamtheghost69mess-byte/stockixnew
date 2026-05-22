const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Category = require("../models/categoryModel");
const MenuItem = require("../models/menuItemModel");
const Table = require("../models/tableModel");
const Organization = require("../models/organizationModel");
const PublicMenuBranding = require("../models/publicMenuBrandingModel");
const StockBalance = require("../models/stockBalanceModel");
const { resolveStockableDemand } = require("../services/inventoryRecipeUtils");
const stockBalanceService = require("../services/stockBalanceService");
const { recordQrMenuScan, readVisitorHeaders } = require("../services/qrMenuScanService");
const { enforceActiveOrganizationById } = require("../middlewares/requireActiveOrganization");

function toPublicBranding(doc, orgName = "") {
  const fallbackName = String(orgName || "").trim() || "Menu";
  return {
    displayName: doc?.displayName?.trim() ? doc.displayName.trim() : fallbackName,
    tagline: doc?.tagline || "",
    logoUrl: doc?.logoUrl || "",
    accentColor: doc?.accentColor || "#ca8a04",
    showPrices: doc?.showPrices !== false,
  };
}

function organizationIdFromTable(table) {
  if (!table) return null;
  const fromTable = table.organization?._id || table.organization;
  if (fromTable) return fromTable;
  const loc = table.location;
  if (!loc) return null;
  return loc.organization?._id || loc.organization || null;
}

async function resolvePublicMenuFromTable(tableId, context = {}) {
  const ref = String(tableId || "").trim();
  if (!ref) {
    throw createHttpError(400, "Missing `table` reference.");
  }
  let table = await Table.findOne({ publicQrToken: ref })
    .populate({ path: "location", select: "organization" })
    .lean();
  if (!table && mongoose.Types.ObjectId.isValid(ref)) {
    table = await Table.findById(ref)
      .populate({ path: "location", select: "organization" })
      .lean();
  }
  if (!table) {
    throw createHttpError(404, "Table not found.");
  }
  const scanRef = table.publicQrToken ? String(table.publicQrToken) : ref;
  const orgId = organizationIdFromTable(table);
  if (!orgId) {
    throw createHttpError(400, "Table has no organization; cannot load menu.");
  }
  const org = await Organization.findById(orgId)
    .select("name timezone licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt")
    .lean();
  if (!org) {
    throw createHttpError(404, "Organization not found.");
  }
  await enforceActiveOrganizationById(orgId, {
    routeKey: "tenant.public.menu.table",
    requestId: context.requestId,
    traceparent: context.traceparent,
  });

  let bDoc = null;
  if (table.location) {
    bDoc = await PublicMenuBranding.findOne({
      organization: orgId,
      scopeKey: String(table.location._id || table.location),
    }).lean();
  }
  if (!bDoc) {
    bDoc = await PublicMenuBranding.findOne({
      organization: orgId,
      scopeKey: "default",
    }).lean();
  }
  const locId = table.location
    ? table.location._id || table.location
    : null;
  return {
    orgId,
    orgName: org?.name || "",
    branding: toPublicBranding(bDoc, org?.name || ""),
    scanMeta: {
      qrCodeId: scanRef,
      location: locId || null,
    },
  };
}

async function buildLiveAvailabilityByMenuItem({
  organizationId,
  locationId,
  items,
}) {
  if (!organizationId || !Array.isArray(items) || items.length === 0) {
    return new Map();
  }

  let resolvedLocationId = null;
  try {
    resolvedLocationId = await stockBalanceService.resolveLocationIdOrDefaultForOrg(
      locationId,
      organizationId
    );
  } catch {
    return new Map();
  }
  if (!resolvedLocationId) return new Map();

  const balances = await StockBalance.find({ location: resolvedLocationId })
    .select("ingredient quantity reservedQty")
    .lean();

  const stockByIngredient = new Map(
    balances.map((row) => {
      const quantity = Number(row.quantity) || 0;
      const reservedQty = Number(row.reservedQty) || 0;
      return [String(row.ingredient), Math.max(0, quantity - reservedQty)];
    })
  );

  const results = new Map();
  for (const item of items) {
    if (!item || !item._id) continue;
    if (item.inventoryImpact !== "stockable") {
      results.set(String(item._id), {
        canFulfill: true,
        estimatedPortions: null,
        reason: "",
      });
      continue;
    }

    let demand = [];
    try {
      demand = await resolveStockableDemand(item._id, 1, null);
    } catch (err) {
      const reason =
        err?.code === "CIRCULAR_RECIPE"
          ? "recipe_cycle"
          : err?.code === "BOM_DEPTH"
            ? "recipe_depth"
            : "recipe_error";
      results.set(String(item._id), {
        canFulfill: false,
        estimatedPortions: 0,
        reason,
      });
      continue;
    }

    if (!Array.isArray(demand) || demand.length === 0) {
      results.set(String(item._id), {
        canFulfill: true,
        estimatedPortions: null,
        reason: "",
      });
      continue;
    }

    let estimatedPortions = Infinity;
    for (const row of demand) {
      const qty = Number(row.qty) || 0;
      if (qty <= 0) continue;
      const available = stockByIngredient.get(String(row.ingredientId)) || 0;
      const portions = Math.floor(available / qty);
      estimatedPortions = Math.min(estimatedPortions, portions);
    }

    const finitePortions =
      estimatedPortions === Infinity ? null : Math.max(0, estimatedPortions);
    const canFulfill = estimatedPortions === Infinity || estimatedPortions > 0;
    results.set(String(item._id), {
      canFulfill,
      estimatedPortions: finitePortions,
      reason: canFulfill ? "" : "out_of_stock",
    });
  }

  return results;
}

async function resolvePublicMenuFromOrgSlug(orgSlug, locationId, context = {}) {
  const slug = String(orgSlug).trim().toLowerCase();
  const org = await Organization.findOne({ slug })
    .select("name timezone licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt")
    .lean();
  if (!org) {
    throw createHttpError(404, "Organization not found.");
  }
  const orgId = org._id;
  await enforceActiveOrganizationById(orgId, {
    routeKey: "tenant.public.menu",
    requestId: context.requestId,
    traceparent: context.traceparent,
  });

  let bDoc = null;
  if (locationId && mongoose.Types.ObjectId.isValid(String(locationId))) {
    bDoc = await PublicMenuBranding.findOne({
      organization: orgId,
      scopeKey: String(locationId),
    }).lean();
  }
  if (!bDoc) {
    bDoc = await PublicMenuBranding.findOne({
      organization: orgId,
      scopeKey: "default",
    }).lean();
  }

  const locOid =
    locationId && mongoose.Types.ObjectId.isValid(String(locationId))
      ? new mongoose.Types.ObjectId(String(locationId))
      : null;

  return {
    orgId,
    orgName: org.name || "",
    branding: toPublicBranding(bDoc, org.name || ""),
    scanMeta: {
      qrCodeId: `org:${slug}`,
      location: locOid,
    },
  };
}

/**
 * Resolve org + branding scope for public menu.
 * Caller must load categories/items with `organization: orgId`.
 *
 * @param {object} opts
 * @param {string} [opts.tableId]
 * @param {string} [opts.orgSlug]
 * @param {string} [opts.locationId] — optional; org-path branding only
 */
async function resolvePublicMenuContext(opts) {
  const { tableId, orgSlug, locationId, requestId, traceparent } = opts;
  const hasTable = Boolean(tableId && String(tableId).trim());
  const hasOrg = Boolean(orgSlug && String(orgSlug).trim());

  if (hasTable === hasOrg) {
    throw createHttpError(
      400,
      "Provide exactly one of: query `table` (opaque table token from table QR) or `org` (organization slug for venue menu)."
    );
  }

  if (hasTable) {
    return resolvePublicMenuFromTable(tableId, { requestId, traceparent });
  }
  return resolvePublicMenuFromOrgSlug(orgSlug, locationId, {
    requestId,
    traceparent,
  });
}

/**
 * Anonymous catalog for self-order / QR.
 * **`table`** (opaque table token from QR; legacy Mongo id still accepted) **or** **`org`** (organization slug): exactly one required.
 * Optional **`location`** (Mongo id) with **`org`** selects location-scoped branding before `default`.
 */
const getPublicMenu = async (req, res, next) => {
  try {
    const { table: tableId, org: orgSlug, location: locationId } = req.query;
    const { orgId, branding, scanMeta } = await resolvePublicMenuContext({
      tableId,
      orgSlug,
      locationId,
      requestId: req?.requestId || res.locals?.requestId,
      traceparent: req.headers?.traceparent || res.locals?.traceparent,
    });

    const categories = await Category.find({ organization: orgId })
      .select("name color sortOrder parentCategory menuNote")
      .populate("parentCategory", "name color")
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    const items = await MenuItem.find({
      organization: orgId,
    })
      .populate("category", "name color sortOrder")
      .sort({ name: 1 })
      .lean();

    const liveAvailability = await buildLiveAvailabilityByMenuItem({
      organizationId: orgId,
      locationId: scanMeta?.location || locationId || null,
      items,
    });
    const itemsWithAvailability = items.map((item) => {
      const live = liveAvailability.get(String(item._id));
      const canFulfillByStock = live ? live.canFulfill : true;
      const baseAvailable = item.isAvailable !== false;
      return {
        ...item,
        isAvailable: baseAvailable && canFulfillByStock,
        stockCanFulfill: live ? live.canFulfill : true,
        estimatedPortions: live?.estimatedPortions ?? null,
        stockReason: live?.reason || "",
      };
    });

    const { visitorKey, sessionId } = readVisitorHeaders(req);
    if (visitorKey && scanMeta?.qrCodeId) {
      void recordQrMenuScan({
        organizationId: orgId,
        qrCodeId: scanMeta.qrCodeId,
        location: scanMeta.location,
        visitorKey,
        sessionId,
      });
    }

    res.status(200).json({
      success: true,
      message: "Public menu.",
      data: { branding, categories, items: itemsWithAvailability },
    });
  } catch (e) {
    next(e);
  }
};

module.exports = { getPublicMenu };
