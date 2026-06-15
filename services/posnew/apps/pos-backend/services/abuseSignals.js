const FraudReviewCase = require("../models/fraudReviewCaseModel");
const { addJob } = require("./jobQueue");
const config = require("../config/config");

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "guerrillamail.com",
  "yopmail.com",
]);

function isDisposableEmail(email) {
  const domain = String(email).split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}

const velocity = {
  signupsByIp: new Map(),
};

let redisClient = null;
function getRedisClient() {
  if (!config.redisUrl) return null;
  if (redisClient) return redisClient;
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const IORedis = require("ioredis");
    redisClient = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });
    redisClient.on("error", () => {});
    return redisClient;
  } catch {
    return null;
  }
}

async function trackSignupIp(ip) {
  const key = ip || "unknown";
  const redis = getRedisClient();
  if (redis) {
    const redisKey = `abuse:signup-ip:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, 3600_000);
    }
    return count;
  }
  const now = Date.now();
  const windowMs = 3600_000;
  const list = velocity.signupsByIp.get(key) || [];
  const recent = list.filter((t) => now - t < windowMs);
  recent.push(now);
  velocity.signupsByIp.set(key, recent);
  return recent.length;
}

async function maybeOpenFraudCase(signal, opts = {}) {
  const doc = await FraudReviewCase.create({
    signal,
    severity: opts.severity || "medium",
    organization: opts.organization || null,
    metadata: opts.metadata,
  });
  await addJob("fraud_review", "case_opened", {
    caseId: String(doc._id),
    signal,
  });
  return doc;
}

module.exports = {
  isDisposableEmail,
  trackSignupIp,
  maybeOpenFraudCase,
  DISPOSABLE_DOMAINS,
};
