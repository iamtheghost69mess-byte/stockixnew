const express = require("express");
const {
  addOrder,
  getOrders,
  getOrderById,
  updateOrder,
  getOpenOrderForTable,
  getKitchenOrders,
  patchOrderItems,
  patchOrderLineItemStatus,
  patchOrderStatus,
  reprintOrderToPrinter,
  transferOrder,
  applyManualDiscount,
  deleteOrder,
  syncOfflineOrders,
  printOrderDocument,
} = require("../controllers/orderController");
const { requirePermission } = require("../middlewares/requirePermission");
const {
  authedTenant,
  authedTenantLocation,
} = require("../middlewares/tenantRouteStacks");
const router = express.Router();

const scoped = authedTenantLocation;

router.get(
  "/kitchen",
  ...authedTenantLocation,
  requirePermission("pos.kitchen.read"),
  getKitchenOrders
);
router.get(
  "/for-table/:tableId",
  ...authedTenant,
  requirePermission("pos.order.read"),
  getOpenOrderForTable
);

router.post(
  "/",
  ...authedTenant,
  requirePermission("pos.order.create"),
  addOrder
);
router.post(
  "/sync",
  ...scoped,
  requirePermission("pos.order.create"),
  syncOfflineOrders
);
router.get(
  "/",
  ...scoped,
  requirePermission("pos.order.read"),
  getOrders
);

router.patch(
  "/:id/items/:itemId/status",
  ...authedTenant,
  requirePermission("pos.kitchen.write"),
  patchOrderLineItemStatus
);
router.patch(
  "/:id/items",
  ...authedTenant,
  requirePermission("pos.order.update"),
  patchOrderItems
);
router.patch(
  "/:id/status",
  ...authedTenant,
  requirePermission("pos.order.update"),
  patchOrderStatus
);
router.patch(
  "/:id/transfer",
  ...authedTenant,
  requirePermission("pos.order.transfer"),
  transferOrder
);
router.post(
  "/:id/manual-discount",
  ...authedTenant,
  requirePermission("pos.order.update"),
  applyManualDiscount
);
router.delete(
  "/:id",
  ...authedTenant,
  requirePermission("pos.order.cancel"),
  deleteOrder
);

router.post(
  "/:id/reprint/:printerId",
  ...authedTenant,
  requirePermission("pos.order.update"),
  reprintOrderToPrinter
);
router.post(
  "/:id/print",
  ...authedTenant,
  requirePermission("pos.order.update"),
  printOrderDocument
);

router.get(
  "/:id",
  ...authedTenant,
  requirePermission("pos.order.read"),
  getOrderById
);
router.put(
  "/:id",
  ...authedTenant,
  requirePermission("pos.order.update"),
  updateOrder
);

module.exports = router;
