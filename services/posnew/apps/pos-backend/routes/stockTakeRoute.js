const express = require("express");
const {
  createSession,
  getSession,
  listSessions,
  patchCounts,
  submitForApproval,
  approveSession,
  postSession,
} = require("../controllers/stockTakeController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const {
  allowInventoryRead,
  allowInventoryWrite,
} = require("../middlewares/backofficeInventory");

const router = express.Router();

router.get("/", ...authedTenant, allowInventoryRead, listSessions);
router.get("/:id", ...authedTenant, allowInventoryRead, getSession);
router.post(
  "/",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  createSession
);
router.patch(
  "/:id/lines",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  patchCounts
);
router.post(
  "/:id/submit-approval",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  submitForApproval
);
router.post(
  "/:id/approve",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  approveSession
);
router.post(
  "/:id/post",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  postSession
);

module.exports = router;
