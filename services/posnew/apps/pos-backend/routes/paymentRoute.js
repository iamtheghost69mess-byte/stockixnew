const express = require("express");
const router = express.Router();
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requirePermission } = require("../middlewares/requirePermission");
const { createOrder, verifyPayment, webHookVerification } = require("../controllers/paymentController");

router
  .route("/create-order")
  .post(...authedTenant, requirePermission("pos.payment.use"), createOrder);
router
  .route("/verify-payment")
  .post(...authedTenant, requirePermission("pos.payment.use"), verifyPayment);
router.route("/webhook-verification").post(webHookVerification);


module.exports = router;