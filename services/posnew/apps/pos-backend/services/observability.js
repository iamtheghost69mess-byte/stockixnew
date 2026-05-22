const config = require("../config/config");

let sentryInited = false;

function initSentry() {
  if (sentryInited || !config.sentryDsn) return;
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const Sentry = require("@sentry/node");
    Sentry.init({
      dsn: config.sentryDsn,
      environment: config.nodeEnv,
      tracesSampleRate:
        config.nodeEnv === "production" ? 0.1 : 1.0,
    });
    sentryInited = true;
  } catch {
    /* optional dependency */
  }
}

function captureError(err, ctx = {}) {
  initSentry();
  if (!config.sentryDsn) return;
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const Sentry = require("@sentry/node");
    Sentry.withScope((scope) => {
      if (ctx.organizationId) {
        scope.setTag("organizationId", String(ctx.organizationId));
      }
      if (ctx.requestId) scope.setTag("request_id", ctx.requestId);
      Sentry.captureException(err);
    });
  } catch {
    /* noop */
  }
}

/** Sample in-memory error budget counter (replace with Prometheus in prod). */
const budget = { errors: 0, requests: 0 };
const routeMetrics = new Map();

function routeMetricKey(method, routePattern) {
  return `${String(method || "GET").toUpperCase()} ${routePattern || "unknown"}`;
}

function trackRouteRequest({ method, routePattern, statusCode, durationMs }) {
  const key = routeMetricKey(method, routePattern);
  const prev = routeMetrics.get(key) || {
    count: 0,
    errors: 0,
    durationTotalMs: 0,
    durationMaxMs: 0,
    status: {},
  };
  prev.count += 1;
  if (Number(statusCode) >= 500) prev.errors += 1;
  const dur = Math.max(0, Number(durationMs) || 0);
  prev.durationTotalMs += dur;
  prev.durationMaxMs = Math.max(prev.durationMaxMs, dur);
  const statusKey = String(statusCode || 0);
  prev.status[statusKey] = (prev.status[statusKey] || 0) + 1;
  routeMetrics.set(key, prev);
}

function snapshotRouteMetrics() {
  return Array.from(routeMetrics.entries()).map(([route, metric]) => ({
    route,
    requests: metric.count,
    errors: metric.errors,
    errorRate: metric.count > 0 ? metric.errors / metric.count : 0,
    avgDurationMs: metric.count > 0 ? metric.durationTotalMs / metric.count : 0,
    maxDurationMs: metric.durationMaxMs,
    status: metric.status,
  }));
}

function trackRequest(ok) {
  budget.requests += 1;
  if (!ok) budget.errors += 1;
}

function errorBudgetRatio() {
  if (!budget.requests) return 0;
  return budget.errors / budget.requests;
}

module.exports = {
  initSentry,
  captureError,
  trackRequest,
  errorBudgetRatio,
  trackRouteRequest,
  snapshotRouteMetrics,
};
