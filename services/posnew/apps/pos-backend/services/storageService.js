const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const fs = require("fs");

/**
 * Storage Service
 * Handles file persistence to either Local Disk or Backblaze B2 (S3 Compatible)
 */

const isB2Enabled =
  process.env.B2_KEY_ID &&
  process.env.B2_APP_KEY &&
  process.env.B2_BUCKET_NAME;

const uploadsRootDir = path.join(__dirname, "..", "uploads");
const b2Endpoint = process.env.B2_ENDPOINT || "s3.us-east-005.backblazeb2.com";
const b2Region = process.env.B2_REGION || "us-east-005";
const configuredPublicBaseUrlRaw =
  process.env.B2_PUBLIC_BASE_URL || process.env.UPLOADS_PUBLIC_ORIGIN || "";
const configuredPublicBaseUrl = String(configuredPublicBaseUrlRaw || "")
  .trim()
  .replace(/\/$/, "");

let s3Client = null;
if (isB2Enabled) {
  if (!configuredPublicBaseUrl) {
    console.warn(
      "[storageService] B2 is enabled without B2_PUBLIC_BASE_URL/UPLOADS_PUBLIC_ORIGIN; using bucket endpoint URL fallback."
    );
  }
  s3Client = new S3Client({
    endpoint: `https://${b2Endpoint}`,
    region: b2Region,
    credentials: {
      accessKeyId: process.env.B2_KEY_ID,
      secretAccessKey: process.env.B2_APP_KEY,
    },
  });
}

/**
 * Upload a file buffer to storage
 * @param {Object} options
 * @param {Buffer} options.buffer - File buffer
 * @param {string} options.filename - Target filename
 * @param {string} options.mimetype - File mimetype
 * @param {string} options.tenantId - Organization ID for segmentation
 * @returns {Promise<string>} - The public URL or relative path
 */
async function uploadFile({ buffer, filename, mimetype, tenantId }) {
  if (isB2Enabled) {
    return uploadToB2({ buffer, filename, mimetype, tenantId });
  }
  return uploadToLocal({ buffer, filename, tenantId });
}

function normalizeManagedKey(key) {
  const normalized = String(key || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  return normalized;
}

function isManagedUploadKey(key) {
  return /^uploads\/[^/]+\/.+/.test(normalizeManagedKey(key));
}

function buildCloudPublicUrlFromKey(key) {
  const normalizedKey = normalizeManagedKey(key);
  if (configuredPublicBaseUrl) {
    return `${configuredPublicBaseUrl}/${normalizedKey}`;
  }
  return `https://${process.env.B2_BUCKET_NAME}.${b2Endpoint}/${normalizedKey}`;
}

function extractCloudKeyFromUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  if (raw.startsWith("/uploads/")) {
    return normalizeManagedKey(raw);
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }

  if (configuredPublicBaseUrl) {
    try {
      const publicBase = new URL(configuredPublicBaseUrl);
      if (parsed.origin === publicBase.origin) {
        const basePath = publicBase.pathname.replace(/\/$/, "");
        const currentPath = parsed.pathname || "";
        if (basePath && currentPath.startsWith(`${basePath}/`)) {
          return normalizeManagedKey(decodeURIComponent(currentPath.slice(basePath.length + 1)));
        }
        if (!basePath || basePath === "/") {
          return normalizeManagedKey(decodeURIComponent(currentPath.replace(/^\/+/, "")));
        }
      }
    } catch {
      // Ignore malformed configured public base and continue to legacy matching.
    }
  }

  const pathname = decodeURIComponent(parsed.pathname || "");
  const host = String(parsed.hostname || "").toLowerCase();
  const bucket = String(process.env.B2_BUCKET_NAME || "").toLowerCase();
  const endpointHost = String(b2Endpoint || "").toLowerCase();

  if (bucket && endpointHost && host === `${bucket}.${endpointHost}`) {
    return normalizeManagedKey(pathname);
  }
  if (bucket && pathname.startsWith(`/file/${bucket}/`)) {
    return normalizeManagedKey(pathname.slice(`/file/${bucket}/`.length));
  }
  return "";
}

function localRelativePathFromUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/uploads/")) {
    return raw.replace(/^\/+/, "");
  }
  try {
    const parsed = new URL(raw);
    if ((parsed.pathname || "").startsWith("/uploads/")) {
      return parsed.pathname.replace(/^\/+/, "");
    }
    return "";
  } catch {
    return "";
  }
}

function isManagedUploadUrl(input) {
  const localRel = localRelativePathFromUrl(input);
  if (/^uploads\/[^/]+\/.+/.test(localRel)) return true;
  const cloudKey = extractCloudKeyFromUrl(input);
  return isManagedUploadKey(cloudKey);
}

async function uploadToB2({ buffer, filename, mimetype, tenantId }) {
  const key = normalizeManagedKey(`uploads/${tenantId}/${Date.now()}-${filename}`);

  const command = new PutObjectCommand({
    Bucket: process.env.B2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    // Note: B2 S3 implementation might require ACL or public bucket settings via B2 dashboard
  });

  await s3Client.send(command);
  return buildCloudPublicUrlFromKey(key);
}

async function uploadToLocal({ buffer, filename, tenantId }) {
  const uploadDir = path.join(uploadsRootDir, tenantId);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const safeFilename = `${Date.now()}-${filename.replace(/[^a-z0-9.]/gi, "_")}`;
  const filePath = path.join(uploadDir, safeFilename);
  
  await fs.promises.writeFile(filePath, buffer);

  // Return relative path for the frontend to proxy
  return `/uploads/${tenantId}/${safeFilename}`;
}

async function deleteCloudObjectByKey(key) {
  const normalizedKey = normalizeManagedKey(key);
  if (!isManagedUploadKey(normalizedKey) || !isB2Enabled || !s3Client) {
    return false;
  }
  const command = new DeleteObjectCommand({
    Bucket: process.env.B2_BUCKET_NAME,
    Key: normalizedKey,
  });
  await s3Client.send(command);
  return true;
}

async function deleteLocalUploadByRelativePath(relativePath) {
  const normalizedRelativePath = String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!/^uploads\/[^/]+\/.+/.test(normalizedRelativePath)) {
    return false;
  }

  const relativeWithinUploads = normalizedRelativePath.slice("uploads/".length);
  const targetPath = path.resolve(uploadsRootDir, relativeWithinUploads);
  const rootPath = path.resolve(uploadsRootDir);
  if (!targetPath.startsWith(rootPath + path.sep)) {
    return false;
  }

  await fs.promises.unlink(targetPath).catch((err) => {
    if (err && err.code === "ENOENT") return;
    throw err;
  });
  return true;
}

async function deleteFileByUrl(url) {
  const localRelative = localRelativePathFromUrl(url);
  if (localRelative) {
    return deleteLocalUploadByRelativePath(localRelative);
  }

  const cloudKey = extractCloudKeyFromUrl(url);
  if (cloudKey) {
    return deleteCloudObjectByKey(cloudKey);
  }
  return false;
}

module.exports = {
  uploadFile,
  deleteFileByUrl,
  isCloud: !!isB2Enabled,
  isManagedUploadUrl,
};
