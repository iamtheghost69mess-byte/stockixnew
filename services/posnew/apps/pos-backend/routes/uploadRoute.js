const express = require("express");
const createHttpError = require("http-errors");
const { uploadImage } = require("../controllers/uploadController");
const { uploadMenuImage } = require("../middlewares/uploadMenuImage");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

function runUpload(req, res, next) {
  uploadMenuImage(req, res, (err) => {
    if (err) {
      return next(
        createHttpError(400, err.message || "Upload failed.")
      );
    }
    next();
  });
}

router.post(
  "/",
  ...authedTenant,
  requireBackofficeStaff,
  runUpload,
  uploadImage
);

module.exports = router;
