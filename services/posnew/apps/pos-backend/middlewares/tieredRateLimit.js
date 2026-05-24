const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const Organization = require("../models/organizationModel");
const config = require("../config/config");
const { orgScopedKey } = require("../services/redisKeys");
const { withRateLimitStore } = require("./rateLimitStore");

const PLAN_LIMITS = {
  standard: { windowMs: 60_000, limit: 600 },
  pro: { windowMs: 60_000, limit: 2000 },
  enterprise: { windowMs: 60_000, limit: 10000 },
};

const RATE_LIMIT_PROBLEM_TYPE = "urn:pos:problems:rate-limit-exceeded";

function wantsProblemRateLimit(req) {
  const acc = req.get("Accept") || "";
  const url = req.originalUrl || req.url || "";
  return (
    acc.includes("application/problem+json") ||
    url.startsWith("/api/platform")
  );
}

function rateLimitProblemHandler(req, res, _next, options) {
  const windowMs = options.windowMs || 60_000;
  const retrySec = Math.max(1, Math.ceil(windowMs / 1000));
  res.set("Retry-After", String(retrySec));
  const detail = `Rate limit exceeded. Retry after ${retrySec} seconds.`;
  const body = {
    type: RATE_LIMIT_PROBLEM_TYPE,
    title: "Rate limit exceeded",
    status: 429,
    detail,
    retry_after_seconds: retrySec,
  };
  if (wantsProblemRateLimit(req)) {
    return res.status(429).type("application/problem+json").json(body);
  }
  res.status(429).json({
    success: false,
    message: detail,
    ...body,
  });
}

const tenantLimiterCache = new Map();

function baseKey(req) {
  const uid = req.user?._id ? String(req.user._id) : "";
  const ip = req.ip || req.connection?.remoteAddress || "::1";
  const core = `${uid}:${ipKeyGenerator(ip)}`;
  if (config.rateLimitOrgScopedKeys && req.tenantOrganizationId) {
    return orgScopedKey(req.tenantOrganizationId, core);
  }
  return core;
}

function tenantLimiterForPlan(plan) {
  if (tenantLimiterCache.has(plan)) return tenantLimiterCache.get(plan);
  const cfg = PLAN_LIMITS[plan] || PLAN_LIMITS.standard;
  const l = rateLimit(
    withRateLimitStore(
      {
        windowMs: cfg.windowMs,
        limit: cfg.limit,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => `${plan}:${baseKey(req)}`,
        handler: rateLimitProblemHandler,
      },
      `tenant:${plan}`
    )
  );
  tenantLimiterCache.set(plan, l);
  return l;
}

async function tenantDynamicRateLimit(req, res, next) {
  try {
    let plan = "standard";
    const oid = req.user?.organization;
    if (oid) {
      const id = oid._id || oid;
      const org = await Organization.findById(id).select("planKey");
      if (org?.planKey && PLAN_LIMITS[org.planKey]) {
        plan = org.planKey;
      }
    }
    return tenantLimiterForPlan(plan)(req, res, next);
  } catch (e) {
    next(e);
  }
}

const platformLoginRateLimit = rateLimit(
  withRateLimitStore(
    {
      windowMs: 15 * 60 * 1000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      handler: rateLimitProblemHandler,
    },
    "platform:login"
  )
);

const platformApiRateLimit = rateLimit(
  withRateLimitStore(
    {
      windowMs: 60 * 1000,
      limit: 3000,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        const k = req.platformAuth?.apiKeyId
          ? `k:${req.platformAuth.apiKeyId}`
          : `u:${req.platformUser?._id || "anon"}`;
        const ip = req.ip || req.connection?.remoteAddress || "::1";
        return `${k}:${ipKeyGenerator(ip)}`;
      },
      handler: rateLimitProblemHandler,
    },
    "platform:api"
  )
);

module.exports = {
  tenantDynamicRateLimit,
  platformLoginRateLimit,
  platformApiRateLimit,
  PLAN_LIMITS,
  rateLimitProblemHandler,
  RATE_LIMIT_PROBLEM_TYPE,
};
