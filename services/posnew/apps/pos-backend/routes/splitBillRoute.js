const express = require("express");
const {
  listSplitBills,
  createSplitBill,
  recordSplitPayment,
} = require("../controllers/splitBillController");
const { authedTenantLocation } = require("../middlewares/tenantRouteStacks");
const { requirePermission } = require("../middlewares/requirePermission");

const router = express.Router();

router.get("/", ...authedTenantLocation, requirePermission("pos.payment.use"), listSplitBills);
router.post("/", ...authedTenantLocation, requirePermission("pos.payment.use"), createSplitBill);
router.post(
  "/:id/splits/:splitId/pay",
  ...authedTenantLocation,
  requirePermission("pos.payment.use"),
  recordSplitPayment
);

module.exports = router;
