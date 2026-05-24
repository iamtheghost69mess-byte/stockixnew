const QrScanEvent = require("../models/qrScanEventModel");

/**
 * Deduped QR / public menu scan (fire-and-forget). Does not throw to callers.
 * Inserts only when `visitorKey` is present — anonymous requests are not counted.
 *
 * @param {object} params
 * @param {import("mongoose").Types.ObjectId} params.organizationId
 * @param {string} params.qrCodeId
 * @param {import("mongoose").Types.ObjectId | null | undefined} params.location
 * @param {string} params.visitorKey
 * @param {string} [params.sessionId]
 * @returns {Promise<void>}
 */
async function recordQrMenuScan(params) {
  const { organizationId, qrCodeId, location, visitorKey, sessionId } = params;
  const key = String(visitorKey || "").trim();
  if (!key || !organizationId || !qrCodeId) return;

  const scannedAt = new Date();
  const visitDayUtc = scannedAt.toISOString().slice(0, 10);

  try {
    await QrScanEvent.create({
      organization: organizationId,
      qrCodeId: String(qrCodeId).trim(),
      location: location || null,
      visitorKey: key,
      sessionId: sessionId ? String(sessionId).trim().slice(0, 256) : "",
      scannedAt,
      visitDayUtc,
    });
  } catch (err) {
    if (err?.code === 11000) return;
    console.warn("[qrMenuScan] recordQrMenuScan failed:", err?.message || err);
  }
}

/**
 * @param {import("express").Request} req
 * @returns {{ visitorKey: string; sessionId: string }}
 */
function readVisitorHeaders(req) {
  const visitorKey = String(req.get("x-visitor-key") || "").trim();
  const sessionId = String(req.get("x-session-id") || "").trim();
  return { visitorKey, sessionId };
}

module.exports = { recordQrMenuScan, readVisitorHeaders };
