const express = require("express");
const {
  listReportSchedules,
  createReportSchedule,
  updateReportSchedule,
  deleteReportSchedule,
  testSendReportSchedule,
} = require("../controllers/reportScheduleController");
const { authedTenantLocation } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

router.get("/", ...authedTenantLocation, requireBackofficeStaff, listReportSchedules);
router.post("/", ...authedTenantLocation, requireBackofficeStaff, createReportSchedule);
router.patch("/:id", ...authedTenantLocation, requireBackofficeStaff, updateReportSchedule);
router.delete("/:id", ...authedTenantLocation, requireBackofficeStaff, deleteReportSchedule);
router.post("/:id/test-send", ...authedTenantLocation, requireBackofficeStaff, testSendReportSchedule);

module.exports = router;
