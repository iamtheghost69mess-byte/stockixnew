const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

function resolveTenantId(req) {
  const tenantOrg =
    req.tenantOrganizationId || req.user?.organization || req.user?.organization?._id;
  if (!tenantOrg) return "";
  return String(tenantOrg._id || tenantOrg).trim();
}

const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  const ok = /^image\/(jpeg|png|webp|gif|svg\+xml)$/i.test(file.mimetype);
  if (!ok) {
    cb(
      new Error(
        "Only JPEG, PNG, WebP, GIF, and SVG images are allowed."
      )
    );
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 },
});

module.exports = { uploadMenuImage: upload.single("image") };
