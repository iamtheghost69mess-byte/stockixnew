const express = require("express");
const {
  listPurchaseOrders,
  listReorderSuggestions,
  createDraftFromSuggestions,
  getPurchaseOrder,
  createPurchaseOrder,
  patchPurchaseOrder,
  confirmPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
} = require("../controllers/purchaseOrderController");
const { authedTenantLocation } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const {
  allowInventoryRead,
  allowInventoryWrite,
} = require("../middlewares/backofficeInventory");

const router = express.Router();

router.get(
  "/suggestions/reorder",
  ...authedTenantLocation,
  allowInventoryRead,
  listReorderSuggestions
);
router.post(
  "/from-suggestions",
  ...authedTenantLocation,
  requireBackofficeStaff,
  allowInventoryWrite,
  createDraftFromSuggestions
);
router.get("/", ...authedTenantLocation, allowInventoryRead, listPurchaseOrders);
router.get("/:id", ...authedTenantLocation, allowInventoryRead, getPurchaseOrder);
router.post(
  "/",
  ...authedTenantLocation,
  requireBackofficeStaff,
  allowInventoryWrite,
  createPurchaseOrder
);
router.patch(
  "/:id",
  ...authedTenantLocation,
  requireBackofficeStaff,
  allowInventoryWrite,
  patchPurchaseOrder
);
router.post(
  "/:id/confirm",
  ...authedTenantLocation,
  requireBackofficeStaff,
  allowInventoryWrite,
  confirmPurchaseOrder
);
router.post(
  "/:id/cancel",
  ...authedTenantLocation,
  requireBackofficeStaff,
  allowInventoryWrite,
  cancelPurchaseOrder
);
router.post(
  "/:id/receive",
  ...authedTenantLocation,
  requireBackofficeStaff,
  allowInventoryWrite,
  receivePurchaseOrder
);

module.exports = router;
