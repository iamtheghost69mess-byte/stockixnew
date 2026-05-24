const mongoose = require("mongoose");
const createHttpError = require("http-errors");
const QRCode = require("qrcode");
const Organization = require("../models/organizationModel");
const PublicMenuBranding = require("../models/publicMenuBrandingModel");
const config = require("../config/config");
const { emitPos } = require("../utils/socketEmit");

function brandingLookup(req, scopeKey) {
  const orgId = req.tenantOrganizationId;
  if (orgId) return { scopeKey, organization: orgId };
  return {
    scopeKey,
    $or: [{ organization: null }, { organization: { $exists: false } }],
  };
}

function normalizeScopeKey(locationId) {
  if (
    locationId == null ||
    String(locationId).trim() === "" ||
    String(locationId) === "default" ||
    String(locationId) === "__default__"
  ) {
    return { scopeKey: "default", location: null };
  }
  const s = String(locationId).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) {
    throw createHttpError(400, "Invalid location id.");
  }
  return { scopeKey: s, location: s };
}

const emptyShape = (scopeKey, location) => ({
  scopeKey,
  location,
  displayName: "",
  tagline: "",
  logoUrl: "",
  accentColor: "#ca8a04",
  showPrices: true,
});

/** GET /api/config/public-menu-branding?location= | default */
const getAdminPublicMenuBranding = async (req, res, next) => {
  try {
    let scopeKey;
    let location;
    try {
      ({ scopeKey, location } = normalizeScopeKey(req.query.location));
    } catch (e) {
      return next(e);
    }
    let doc = await PublicMenuBranding.findOne(
      brandingLookup(req, scopeKey)
    ).lean();
    if (!doc) {
      doc = emptyShape(scopeKey, location);
    }
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

/** PUT /api/config/public-menu-branding — body includes optional location (null / omit = default) */
const putAdminPublicMenuBranding = async (req, res, next) => {
  try {
    const {
      location: locBody,
      displayName,
      tagline,
      logoUrl,
      accentColor,
      showPrices,
    } = req.body || {};

    let scopeKey;
    let location;
    try {
      ({ scopeKey, location } = normalizeScopeKey(locBody));
    } catch (e) {
      return next(e);
    }

    const orgId = req.tenantOrganizationId;
    const doc = await PublicMenuBranding.findOneAndUpdate(
      brandingLookup(req, scopeKey),
      {
        $set: {
          scopeKey,
          location,
          ...(orgId ? { organization: orgId } : {}),
          displayName: String(displayName ?? "").trim(),
          tagline: String(tagline ?? "").trim(),
          logoUrl: String(logoUrl ?? "").trim(),
          accentColor:
            String(accentColor ?? "#ca8a04").trim() || "#ca8a04",
          showPrices: showPrices !== false,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    emitPos(req, "catalog:updated", { scope: "branding", scopeKey });
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

/** GET /api/config/self-order-venue-qr — PNG QR for browse-only venue menu (`/self-order?org=slug`). */
const getSelfOrderVenueQr = async (req, res, next) => {
  try {
    const orgId = req.tenantOrganizationId;
    if (!orgId) {
      return next(createHttpError(400, "Organization context required."));
    }
    const org = await Organization.findById(orgId).select("slug").lean();
    if (!org?.slug) {
      return next(createHttpError(404, "Organization not found."));
    }
    const url = `${config.publicAppUrl}/self-order?org=${encodeURIComponent(org.slug)}`;
    const png = await QRCode.toBuffer(url, {
      type: "png",
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    res.type("image/png").send(png);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  getAdminPublicMenuBranding,
  putAdminPublicMenuBranding,
  getSelfOrderVenueQr,
};
