/**
 * Platform control-plane SSE.
 * Emits: `ready`, `ping`, and `audit` (new rows since last watermark).
 * For heavy deployments, increase `PLATFORM_SSE_POLL_MS` or disable audit tail via `PLATFORM_SSE_AUDITS=0`.
 */
const PlatformAuditLog = require("../models/platformAuditLogModel");

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function sanitizeAudit(doc) {
  const meta = doc.metadata;
  let metadataKeys;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    metadataKeys = Object.keys(meta).slice(0, 40);
  }
  return {
    id: String(doc._id),
    action: doc.action,
    actorType: doc.actorType,
    organization: doc.organization ? String(doc.organization) : null,
    createdAt: doc.createdAt,
    requestId: doc.requestId || "",
    metadataKeys,
  };
}

function platformSseStream(req, res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  res.write(
    `event: ready\ndata: ${JSON.stringify({
      ok: true,
      channel: "platform-v1",
      auditsEnabled: String(process.env.PLATFORM_SSE_AUDITS || "1") !== "0",
    })}\n\n`
  );

  const pingMs = clamp(
    Number.parseInt(String(process.env.PLATFORM_SSE_PING_MS || "25000"), 10) || 25000,
    5000,
    120_000
  );
  const pollMs = clamp(
    Number.parseInt(String(process.env.PLATFORM_SSE_POLL_MS || "15000"), 10) || 15000,
    5000,
    120_000
  );

  let watermark = new Date(Date.now() - 120_000);
  let closed = false;
  const maxPendingBytes = clamp(
    Number.parseInt(String(process.env.PLATFORM_SSE_MAX_PENDING_BYTES || "524288"), 10) ||
      524_288,
    16_384,
    16_777_216
  );
  let backlogNotices = 0;

  function responseBacklogged() {
    if (closed || res.writableEnded || res.destroyed) return true;
    const len = typeof res.writableLength === "number" ? res.writableLength : 0;
    return len > maxPendingBytes;
  }

  const pingIv = setInterval(() => {
    if (closed) return;
    try {
      res.write(`event: ping\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
    } catch {
      clearInterval(pingIv);
    }
  }, pingMs);

  const auditIv = setInterval(async () => {
    if (closed) return;
    try {
      if (String(process.env.PLATFORM_SSE_AUDITS || "1") !== "0") {
        if (responseBacklogged()) {
          backlogNotices += 1;
          if (backlogNotices <= 3 || backlogNotices % 20 === 0) {
            try {
              res.write(
                `event: notice\ndata: ${JSON.stringify({
                  code: "sse_backpressure",
                  message: "Client buffer full; audit tail paused this tick.",
                  writableLength: res.writableLength,
                  maxPendingBytes,
                  t: Date.now(),
                })}\n\n`
              );
            } catch {
              /* ignore */
            }
          }
        } else {
          const rows = await PlatformAuditLog.find({ createdAt: { $gt: watermark } })
            .sort({ createdAt: 1 })
            .limit(100)
            .lean();
          for (const r of rows) {
            if (responseBacklogged()) break;
            res.write(`event: audit\ndata: ${JSON.stringify(sanitizeAudit(r))}\n\n`);
            if (r.createdAt && new Date(r.createdAt) > watermark) {
              watermark = new Date(r.createdAt);
            }
          }
        }
      }

    } catch (e) {
      try {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            message: e instanceof Error ? e.message : String(e),
          })}\n\n`
        );
      } catch {
        /* ignore */
      }
    }
  }, pollMs);

  const cleanup = () => {
    closed = true;
    clearInterval(pingIv);
    clearInterval(auditIv);
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };
  req.on("close", cleanup);
  res.on("finish", cleanup);
}

module.exports = { platformSseStream };
