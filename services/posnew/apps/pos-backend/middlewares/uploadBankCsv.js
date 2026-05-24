const multer = require("multer");

const MAX_BYTES = 2 * 1024 * 1024;

function fileFilter(_req, file, cb) {
  const mimeOk = /^(text\/csv|application\/csv|application\/vnd\.ms-excel|text\/plain|application\/octet-stream)$/i.test(
    file.mimetype || "",
  );
  const nameOk = /\.csv$/i.test(file.originalname || "");
  if (!mimeOk && !nameOk) {
    cb(new Error("Only CSV files are allowed."));
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_BYTES, files: 1 },
});

module.exports = { uploadBankCsv: upload.single("file") };
