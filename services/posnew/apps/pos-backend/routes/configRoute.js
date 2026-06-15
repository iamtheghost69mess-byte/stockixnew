const express = require("express");
const { getTax, putTax } = require("../controllers/configController");
const {
  getAdminPublicMenuBranding,
  putAdminPublicMenuBranding,
  getSelfOrderVenueQr,
} = require("../controllers/publicMenuBrandingController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requirePermission } = require("../middlewares/requirePermission");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

router.get("/tax", ...authedTenant, requirePermission("pos.config.read"), getTax);
router.put(
  "/tax",
  ...authedTenant,
  requireBackofficeStaff,
  putTax
);

router.get(
  "/public-menu-branding",
  ...authedTenant,
  requireBackofficeStaff,
  getAdminPublicMenuBranding
);
router.put(
  "/public-menu-branding",
  ...authedTenant,
  requireBackofficeStaff,
  putAdminPublicMenuBranding
);

router.get(
  "/self-order-venue-qr",
  ...authedTenant,
  requireBackofficeStaff,
  getSelfOrderVenueQr
);

module.exports = router;
