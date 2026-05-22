const createHttpError = require("http-errors");
const { uploadFile } = require("../services/storageService");

const uploadImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(createHttpError(400, "No image file uploaded."));
    }

    const tenantId =
      req.uploadTenantId ||
      req.tenantOrganizationId ||
      req.user?.organization ||
      "";
    
    const tenantSegment = String(tenantId._id || tenantId).trim();
    if (!tenantSegment) {
      return next(createHttpError(403, "Organization context is required for uploads."));
    }

    const fileUrl = await uploadFile({
      buffer: req.file.buffer,
      filename: req.file.originalname || "image.jpg",
      mimetype: req.file.mimetype,
      tenantId: tenantSegment,
    });

    res.status(201).json({
      success: true,
      message: "File uploaded successfully.",
      data: { url: fileUrl },
    });
  } catch (e) {
    next(e);
  }
};

module.exports = { uploadImage };
