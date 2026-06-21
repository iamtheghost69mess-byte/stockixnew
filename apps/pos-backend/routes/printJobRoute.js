const express = require("express");
const {
  listPrintJobs,
  getPrintJobById,
  ackPrintJob,
  retryPrintJob,
} = require("../controllers/printJobController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requirePermission } = require("../middlewares/requirePermission");

const router = express.Router();

router.get("/", ...authedTenant, requirePermission("pos.printer.read"), listPrintJobs);
router.get("/:id", ...authedTenant, requirePermission("pos.printer.read"), getPrintJobById);
router.patch("/:id/ack", ...authedTenant, requirePermission("pos.printer.read"), ackPrintJob);
router.post("/:id/retry", ...authedTenant, requirePermission("pos.printer.read"), retryPrintJob);

module.exports = router;
