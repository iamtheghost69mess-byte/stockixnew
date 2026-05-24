const crypto = require("crypto");
const { trackRouteRequest } = require("../services/observability");

function parseTraceparent(h) {
  const s = String(h || "").trim();
  // W3C traceparent: 00-{trace-id}-{parent-id}-{flags}
  const m = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(
    s
  );
  if (!m) return { traceparent: "", traceId: "", parentId: "" };
  return { traceparent: s, traceId: m[2], parentId: m[3] };
}

function requestCorrelation(req, res, next) {
  const incoming =
    req.headers["x-request-id"] || req.headers["x-correlation-id"];
  const requestId = incoming
    ? String(incoming).slice(0, 128)
    : crypto.randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const tp = req.headers.traceparent;
  const parsed = parseTraceparent(tp);
  res.locals.traceparent = parsed.traceparent;
  res.locals.traceId = parsed.traceId;
  if (parsed.traceparent) {
    res.setHeader("traceparent", parsed.traceparent);
  }
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const endedAt = process.hrtime.bigint();
    const durationMs = Number(endedAt - startedAt) / 1_000_000;
    const routePattern =
      `${req.baseUrl || ""}${req.route?.path || req.path || ""}` || req.originalUrl;
    trackRouteRequest({
      method: req.method,
      routePattern,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}

module.exports = { requestCorrelation, parseTraceparent };
