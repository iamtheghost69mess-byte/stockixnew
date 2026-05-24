const express = require("express");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireAnyRoleOrPermission } = require("../middlewares/requireRoleOrPermission");
const {
  listCustomers,
  createCustomer,
  updateCustomer,
  getCustomerOrders,
} = require("../controllers/customerController");

const router = express.Router();

/** Admin/manager job title, hostess (reservations desk), or RBAC `backoffice.*`. */
const mgr = [
  ...authedTenant,
  requireAnyRoleOrPermission(["admin", "manager", "hostess"], ["backoffice.*"]),
];

router.get("/", ...mgr, listCustomers);
router.post("/", ...mgr, createCustomer);
router.get("/:id/orders", ...mgr, getCustomerOrders);
router.patch("/:id", ...mgr, updateCustomer);

module.exports = router;
