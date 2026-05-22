const Organization = require("../models/organizationModel");
const Location = require("../models/locationModel");
const User = require("../models/userModel");

const DEFAULT_MAX_LOCATIONS = 5;
const DEFAULT_MAX_USERS = 25;

function maxLocationsFromEntitlements(ent) {
  const raw = ent && Object.prototype.hasOwnProperty.call(ent, "maxLocations")
    ? ent.maxLocations
    : undefined;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  return DEFAULT_MAX_LOCATIONS;
}

function maxUsersFromEntitlements(ent) {
  const raw = ent && Object.prototype.hasOwnProperty.call(ent, "maxUsers")
    ? ent.maxUsers
    : undefined;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  return DEFAULT_MAX_USERS;
}

function currentPeriodYm(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function ensureUsagePeriod(orgDoc) {
  const ym = currentPeriodYm();
  if (orgDoc.usageCounters?.usagePeriodYm !== ym) {
    orgDoc.usageCounters = orgDoc.usageCounters || {};
    orgDoc.usageCounters.ordersThisMonth = 0;
    orgDoc.usageCounters.apiCallsThisMonth = 0;
    orgDoc.usageCounters.usagePeriodYm = ym;
    await orgDoc.save();
  }
}

async function assertWithinLimit(orgId, key, increment = 0) {
  const org = await Organization.findById(orgId);
  if (!org) throw new Error("Organization not found");
  await ensureUsagePeriod(org);

  const ent = org.entitlements || {};
  const limits = {
    maxOrdersPerMonth: ent.maxOrdersPerMonth ?? 10000,
    maxApiCallsPerMonth: ent.maxApiCallsPerMonth ?? 100000,
  };

  if (key === "orders") {
    const next = (org.usageCounters.ordersThisMonth || 0) + increment;
    if (next > limits.maxOrdersPerMonth) {
      const err = new Error("Order volume exceeds plan limit.");
      err.status = 402;
      throw err;
    }
  }
  if (key === "apiCalls") {
    const next = (org.usageCounters.apiCallsThisMonth || 0) + increment;
    if (next > limits.maxApiCallsPerMonth) {
      const err = new Error("API call volume exceeds plan limit.");
      err.status = 429;
      throw err;
    }
  }
}

function usageCounterField(key) {
  if (key === "orders") return "ordersThisMonth";
  if (key === "apiCalls") return "apiCallsThisMonth";
  throw new Error(`Unsupported usage counter key: ${key}`);
}

function usageLimitFor(orgDoc, key) {
  const ent = orgDoc?.entitlements || {};
  if (key === "orders") return Number(ent.maxOrdersPerMonth ?? 10000);
  if (key === "apiCalls") return Number(ent.maxApiCallsPerMonth ?? 100000);
  throw new Error(`Unsupported usage limit key: ${key}`);
}

async function consumeWithinLimit(orgId, key, amount = 1) {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("amount must be a positive number");
  }
  const ym = currentPeriodYm();
  const field = usageCounterField(key);
  const org = await Organization.findById(orgId).select("entitlements");
  if (!org) throw new Error("Organization not found");
  const limit = usageLimitFor(org, key);

  const matchExpr = {
    $lte: [
      {
        $add: [
          {
            $cond: [
              { $eq: ["$usageCounters.usagePeriodYm", ym] },
              { $ifNull: [`$usageCounters.${field}`, 0] },
              0,
            ],
          },
          normalizedAmount,
        ],
      },
      limit,
    ],
  };

  const updated = await Organization.findOneAndUpdate(
    {
      _id: orgId,
      $expr: matchExpr,
    },
    [
      {
        $set: {
          usageCounters: {
            $mergeObjects: [
              { ordersThisMonth: 0, apiCallsThisMonth: 0, usagePeriodYm: ym },
              "$usageCounters",
              {
                usagePeriodYm: ym,
                ordersThisMonth: {
                  $cond: [
                    { $eq: ["$usageCounters.usagePeriodYm", ym] },
                    { $ifNull: ["$usageCounters.ordersThisMonth", 0] },
                    0,
                  ],
                },
                apiCallsThisMonth: {
                  $cond: [
                    { $eq: ["$usageCounters.usagePeriodYm", ym] },
                    { $ifNull: ["$usageCounters.apiCallsThisMonth", 0] },
                    0,
                  ],
                },
              },
            ],
          },
        },
      },
      {
        $set: {
          [`usageCounters.${field}`]: {
            $add: [
              { $ifNull: [`$usageCounters.${field}`, 0] },
              normalizedAmount,
            ],
          },
        },
      },
    ],
    { new: true }
  );

  if (!updated) {
    const err = new Error(
      key === "orders"
        ? "Order volume exceeds plan limit."
        : "API call volume exceeds plan limit."
    );
    err.status = key === "orders" ? 402 : 429;
    throw err;
  }
  return updated;
}

/**
 * Enforces {@link Organization#entitlements} `maxLocations` before creating a branch.
 * Existing locations over the cap are not removed; only new creates are blocked.
 */
async function assertLocationCreateAllowed(orgId) {
  const org = await Organization.findById(orgId).select("entitlements").lean();
  if (!org) {
    const err = new Error("Organization not found");
    err.status = 404;
    throw err;
  }
  const cap = maxLocationsFromEntitlements(org.entitlements);
  const count = await Location.countDocuments({ organization: orgId });
  if (count >= cap) {
    const err = new Error(
      `Maximum of ${cap} location(s) included in your plan. To add more branches, contact support.`
    );
    err.status = 403;
    throw err;
  }
}

/**
 * Enforces {@link Organization#entitlements} `maxUsers` before creating another staff user.
 * Counts all users for the org (including suspended).
 */
async function assertStaffCreateAllowed(orgId) {
  const org = await Organization.findById(orgId).select("entitlements").lean();
  if (!org) {
    const err = new Error("Organization not found");
    err.status = 404;
    throw err;
  }
  const cap = maxUsersFromEntitlements(org.entitlements);
  const count = await User.countDocuments({ organization: orgId });
  if (count >= cap) {
    const err = new Error(
      `Maximum of ${cap} staff user(s) included in your plan. Remove a user or raise the limit in the owner console.`
    );
    err.status = 403;
    throw err;
  }
}

async function incrementUsage(orgId, key, amount = 1) {
  const org = await Organization.findById(orgId);
  if (!org) return;
  await ensureUsagePeriod(org);
  if (!org.usageCounters) org.usageCounters = {};
  if (key === "orders") {
    org.usageCounters.ordersThisMonth =
      (org.usageCounters.ordersThisMonth || 0) + amount;
  }
  if (key === "apiCalls") {
    org.usageCounters.apiCallsThisMonth =
      (org.usageCounters.apiCallsThisMonth || 0) + amount;
  }
  await org.save();
}

module.exports = {
  assertWithinLimit,
  consumeWithinLimit,
  assertLocationCreateAllowed,
  assertStaffCreateAllowed,
  maxUsersFromEntitlements,
  incrementUsage,
  ensureUsagePeriod,
  currentPeriodYm,
};
